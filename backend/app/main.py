from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api import router
from .config import Config
from .db import Database, SettingsStore
from .errors import install_error_handlers
from .ml.predictor import Predictor
from .simulation import SimulationController
from .twin import DigitalTwin

logging.basicConfig(level=logging.INFO)


def create_app(config: Config | None = None) -> FastAPI:
    config = config or Config()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        db = Database(config.db_path)
        db.init()
        app.state.settings = SettingsStore(db)
        app.state.predictor = Predictor(config.model_dir)
        app.state.twin = DigitalTwin(db, app.state.predictor, app.state.settings)
        app.state.sim = SimulationController(config, db, app.state.twin, app.state.settings)
        await asyncio.to_thread(app.state.sim.initialize)
        task = asyncio.create_task(app.state.sim.run_loop())
        yield
        task.cancel()

    app = FastAPI(title="ICU Deterioration Digital Twin API", version="1.0.0",
                  description="Research prototype using synthetic data. Not for clinical use.", lifespan=lifespan)
    app.state.config = config
    app.add_middleware(CORSMiddleware, allow_origins=config.cors_origins, allow_methods=["*"], allow_headers=["*"],
                       allow_credentials=True)
    install_error_handlers(app)
    app.include_router(router)
    return app


app = create_app()
