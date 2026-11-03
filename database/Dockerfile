FROM quay.io/mariadb-foundation/mariadb-devel:13.1

RUN useradd --system --no-create-home --shell /usr/sbin/nologin project_socket

COPY database/security /opt/project-security

COPY database/tls/99-tls.cnf /etc/mysql/conf.d/99-tls.cnf
COPY database/tls/certs /etc/mysql/tls

RUN chown -R mysql:mysql /etc/mysql/tls \
    && chmod 644 /etc/mysql/tls/ca.pem /etc/mysql/tls/server-cert.pem \
    && chmod 600 /etc/mysql/tls/server-key.pem
