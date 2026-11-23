FROM quay.io/mariadb-foundation/mariadb-devel:13.1@sha256:1318772c2f00cd67d483921bc144f493d9720aaf53699894f6472715a65ef224

RUN useradd --system --no-create-home --shell /usr/sbin/nologin project_socket

RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY database/tls/99-tls.cnf /etc/mysql/conf.d/99-tls.cnf
