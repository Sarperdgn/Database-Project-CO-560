FROM quay.io/mariadb-foundation/mariadb-devel:13.1@sha256:7723a49e7bec849c0de7b8cb74b2a30dfb1ac4706693d537ceccd0649ed66da5

RUN useradd --system --no-create-home --shell /usr/sbin/nologin project_socket

RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY database/tls/99-tls.cnf /etc/mysql/conf.d/99-tls.cnf
