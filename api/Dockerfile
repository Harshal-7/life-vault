# Life Vault API + worker. One small image; Fly runs both processes in one machine.
FROM python:3.12-slim

COPY --from=ghcr.io/astral-sh/uv:0.13 /uv /uvx /bin/

WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PYTHONUNBUFFERED=1

# Dependencies first (cached unless pyproject/uv.lock change), then the code.
COPY pyproject.toml uv.lock .python-version ./
RUN uv sync --locked --no-dev --no-install-project

COPY . .
ENV PATH="/app/.venv/bin:$PATH"

# Run as a non-root user.
RUN useradd --create-home app && chown -R app /app
USER app

EXPOSE 8080
CMD ["bash", "start.sh"]
