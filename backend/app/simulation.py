"""Simulation controller: drives the synthetic patients and the Start / Pause / Reset controls."""
from __future__ import annotations

import asyncio
import logging
import random
import threading

import numpy as np

from .config import Config
from .db import Database, SettingsStore
from .domain import VITALS
from .simulator import PatientSimulator, build_roster
from .twin import DigitalTwin, now_iso

log = logging.getLogger(__name__)
DROPOUT_PROBABILITY = 0.004  # per patient per tick: one sensor value goes missing


class SimulationController:
    def __init__(self, config: Config, db: Database, twin: DigitalTwin, settings: SettingsStore):
        self.config, self.db, self.twin, self.settings = config, db, twin, settings
        self.running = False
        self.tick_count = 0
        self.sims: dict[str, PatientSimulator] = {}
        self._lock = threading.RLock()
        self._rng = random.Random(config.seed)

    # --------------------------------------------------------------- lifecycle
    def initialize(self) -> None:
        roster = build_roster(self.config.n_patients, self.config.seed)
        with self.db.connect() as conn:
            existing = [r[0] for r in conn.execute("SELECT patient_id FROM patients ORDER BY patient_id")]
        if existing:
            self._build_sims([p for p in roster if p["patient_id"] in existing])
            with self.db.connect() as conn:
                counts = dict(conn.execute("SELECT patient_id, COUNT(*) FROM vital_measurements WHERE source='simulation' GROUP BY patient_id").fetchall())
            for pid, sim in self.sims.items():
                sim.fast_forward(counts.get(pid, 0))
            self.tick_count = max(counts.values(), default=0)
        else:
            self.reset()
        self.running = self.config.autostart

    def reset(self) -> None:
        with self._lock:
            self.running = False
            roster = build_roster(self.config.n_patients, self.config.seed)
            self.twin.reset_data()
            for p in roster:
                self.twin.add_patient(p)
            self._build_sims(roster)
            interval = self.settings.get()["interval_seconds"]
            n = self.config.initial_history
            for i in range(n):  # back-fill recent history so charts are not empty
                self._tick(timestamp_offset=-(n - i) * interval, dropout=False)
            self.tick_count = 0

    def _build_sims(self, roster: list[dict]) -> None:
        self.sims = {p["patient_id"]: PatientSimulator(np.random.default_rng(p["sim_seed"]), p["age"], p["scenario"], p["onset"])
                     for p in roster}

    def rename_patient(self, old_id: str, new_id: str) -> None:
        with self._lock:
            if old_id in self.sims:
                self.sims[new_id] = self.sims.pop(old_id)

    def remove_patient(self, patient_id: str) -> None:
        with self._lock:
            self.sims.pop(patient_id, None)

    # ------------------------------------------------------------------- ticks
    def _tick(self, timestamp_offset: float = 0.0, dropout: bool = True) -> None:
        for pid, sim in self.sims.items():
            vitals = sim.next()
            if dropout and self.tick_count > 0 and self._rng.random() < DROPOUT_PROBABILITY:
                vitals[self._rng.choice(VITALS)] = None
            self.twin.ingest(pid, vitals, timestamp=now_iso(timestamp_offset), source="simulation")
        self.tick_count += 1

    def step(self) -> None:
        with self._lock:
            self._tick()

    def start(self) -> None:
        self.running = True

    def pause(self) -> None:
        self.running = False

    def status(self) -> dict:
        return {"running": self.running, "tick_count": self.tick_count, "patient_count": len(self.sims),
                "interval_seconds": self.settings.get()["interval_seconds"]}

    async def run_loop(self) -> None:
        while True:
            if self.running:
                try:
                    await asyncio.to_thread(self.step)
                except Exception:
                    log.exception("simulation tick failed")
            await asyncio.sleep(self.settings.get()["interval_seconds"])
