"""Add submitted_at field to issues for FormSG submission timestamp

Revision ID: add_submitted_at
Revises: f8a2d1e9c3b5
Create Date: 2026-06-23 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = 'add_submitted_at'
down_revision = 'f8a2d1e9c3b5'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('issues', schema=None) as batch_op:
        batch_op.add_column(sa.Column('submitted_at', sa.DateTime(), nullable=True))


def downgrade():
    with op.batch_alter_table('issues', schema=None) as batch_op:
        batch_op.drop_column('submitted_at')
