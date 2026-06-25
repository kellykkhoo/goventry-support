"""feature_requests_module

Revision ID: a1b2c3d4e5f6
Revises: add_submitted_at
Create Date: 2026-06-26 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = 'a1b2c3d4e5f6'
down_revision = 'add_submitted_at'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'feature_requests',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('title', sa.String(length=500), nullable=False),
        sa.Column('description', sa.Text(), nullable=False),
        sa.Column(
            'status',
            sa.Enum('New', 'UnderReview', 'Planned', 'InProgress', 'Released', 'Rejected', name='frstatus'),
            nullable=False,
        ),
        sa.Column(
            'priority',
            sa.Enum('High', 'Medium', 'Low', name='frpriority'),
            nullable=False,
        ),
        sa.Column('product', sa.String(length=50), nullable=True),
        sa.Column('pm_notes', sa.Text(), nullable=True),
        sa.Column('target_release', sa.String(length=50), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint('id'),
    )

    op.create_table(
        'feature_request_agencies',
        sa.Column('feature_request_id', sa.Integer(), nullable=False),
        sa.Column('agency_id', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(['feature_request_id'], ['feature_requests.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['agency_id'], ['agencies.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('feature_request_id', 'agency_id'),
    )

    op.create_table(
        'feature_request_tickets',
        sa.Column('feature_request_id', sa.Integer(), nullable=False),
        sa.Column('issue_id', sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(['feature_request_id'], ['feature_requests.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['issue_id'], ['issues.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('feature_request_id', 'issue_id'),
    )


def downgrade():
    op.drop_table('feature_request_tickets')
    op.drop_table('feature_request_agencies')
    op.drop_table('feature_requests')
    op.execute("DROP TYPE IF EXISTS frstatus")
    op.execute("DROP TYPE IF EXISTS frpriority")
