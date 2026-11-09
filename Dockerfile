FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.json vite.config.ts index.html ./
COPY src ./src
RUN npm run build

FROM python:3.12-slim
RUN useradd --create-home --uid 1000 reader
WORKDIR /app
COPY --from=build /app/dist /app/site
COPY deploy/serve.py /app/serve.py
COPY LICENSE /app/LICENSE
RUN python -c "from pathlib import Path; import gzip; files=[p for p in Path('/app/site').rglob('*') if p.is_file() and p.suffix in ('.js','.css','.wasm','.html')]; [(p.with_name(p.name+'.gz').write_bytes(gzip.compress(p.read_bytes(),compresslevel=6))) for p in files]"
USER reader
ENV PORT=7860
EXPOSE 7860
CMD ["python", "-u", "/app/serve.py"]
