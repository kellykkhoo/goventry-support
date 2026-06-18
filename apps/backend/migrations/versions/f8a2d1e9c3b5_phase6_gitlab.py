"""phase6_gitlab_issue_proposals

Revision ID: f8a2d1e9c3b5
Revises: 3e7cd7b654ce
Create Date: 2026-06-18 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


revision = 'f8a2d1e9c3b5'
down_revision = '3e7cd7b654ce'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'gitlab_issue_proposals',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('repo', sa.String(length=50), nullable=False),
        sa.Column('title', sa.String(length=255), nullable=False),
        sa.Column('description', sa.Text(), nullable=False),
        sa.Column('labels', sa.JSON(), nullable=False),
        sa.Column('related_ticket_ids', sa.JSON(), nullable=False),
        sa.Column('confidence', sa.Float(), nullable=True),
        sa.Column(
            'status',
            sa.Enum('pending', 'approved', 'rejected', 'created', name='gitlab_proposalstatus'),
            nullable=False,
        ),
        sa.Column('created_by_id', sa.Integer(), nullable=True),
        sa.Column('reviewer_id', sa.Integer(), nullable=True),
        sa.Column('reject_reason', sa.Text(), nullable=True),
        sa.Column('gitlab_issue_url', sa.String(length=500), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('decided_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['created_by_id'], ['users.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['reviewer_id'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )


def downgrade():
    op.drop_table('gitlab_issue_proposals')
    op.execute("DROP TYPE IF EXISTS gitlab_proposalstatus")
