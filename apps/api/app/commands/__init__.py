# apps/api/app/commands/__init__.py
import click
from flask import Flask
from .seed import seed_demo


def register_commands(app: Flask) -> None:
    @app.cli.command("seed-demo")
    @click.option("--if-empty", is_flag=True, default=False)
    def seed_demo_cmd(if_empty):
        seed_demo(if_empty=if_empty)
        print("seed-demo complete.")
