# syntax=docker/dockerfile:1.7
#
# The laptop's database image: `postgres:16-alpine` with the pgvector
# extension built in, so the memory tier (the quality loop's and
# agentic-memory's vector tables) lives in the same Postgres as every other
# table. docker-compose builds it for the `db` service on the first
# `pnpm stack:up`; by hand:
#
#   docker build -f docker/postgres-pgvector.Dockerfile -t sysdesign/postgres-pgvector:16-0.8.0 .
#
# Why Alpine stays: the compose volume `sysdesign-pgdata` was initialised by
# `postgres:16-alpine`, whose C library is musl. The hub's pgvector images are
# Debian (glibc), and the two libraries do not collate `en_US.utf8` alike, so a
# glibc server opened on the same files would read every text btree index as
# built by the other library and silently mis-sort — Postgres trusts an index
# as it stands and never rechecks it. Adding the extension to the same base
# keeps the volume as it is: no dump and restore, no REINDEX.
#
# Why 0.8.0: Aurora PostgreSQL 16.10 ships pgvector 0.8.0, and CI runs the hub
# image `pgvector/pgvector:0.8.0-pg16` (the same PostgreSQL 16.10 and pgvector
# 0.8.0), so the laptop builds that version from its GitHub tag and the three
# databases answer the same SQL — HNSW, `hnsw.iterative_scan`, the `<=>`
# operator on `vector(n)`.
#
# `with_llvm=no` on both `make` and `make install`: the official image is
# configured with LLVM, so the extension build would otherwise also emit
# bitcode for the JIT (needing clang and llvm at build time); the extension
# runs without it. `OPTFLAGS=""` is what pgvector's own Dockerfile passes: the
# default `-march=native` would bind the binary to the CPU of the machine that
# built it, and this image is kept and reused across Docker Desktop updates.
# The build dependencies and the source leave in the same layer, so the image
# is the base plus one extension.
FROM postgres:16-alpine

RUN apk add --no-cache --virtual .build-deps git build-base \
  && git clone --depth 1 --branch v0.8.0 https://github.com/pgvector/pgvector.git /tmp/pgvector \
  && cd /tmp/pgvector \
  && make with_llvm=no OPTFLAGS="" \
  && make install with_llvm=no \
  && rm -rf /tmp/pgvector \
  && apk del --no-network .build-deps
