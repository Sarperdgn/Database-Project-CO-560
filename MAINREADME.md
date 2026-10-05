A project for area 5, "Authentication and access control" for the [MariaDB student database projects, 2026-09](https://mariadb.org/bachelor_hackathon_2026-09/).

# MariaDB Authentication and Access Control

This repository contains our course project for **Databases & Web Services (CO-560)** at Constructor University.

The project focuses on MariaDB's authentication and access-control capabilities. The goal is to build a reproducible environment that demonstrates how MariaDB can protect database resources using roles, privileges, `DENY`, authentication mechanisms, and verified TLS connections.

## Project Goals

The project will explore and demonstrate:

- MariaDB user and role management
- `GRANT` and `DENY` permissions
- Role-based access control
- Authentication mechanisms
- Secure client-server connections using TLS
- Access restrictions at different privilege levels
- Testing unauthorized access attempts
- Demonstrating how MariaDB responds to different attack scenarios
- Documenting the limitations and behavior of the implemented security mechanisms

## Planned Demonstration

The project will use a small example database with different types of users and roles.

Example roles may include:

- Administrator
- Employee
- Manager
- Auditor
- Application user

Different permissions will be assigned to each role, allowing us to demonstrate both permitted and denied operations.

The project will also contain tests that intentionally attempt unauthorized actions in order to verify that the configured MariaDB security mechanisms correctly prevent them.

## Technologies

- MariaDB
- SQL
- Linux
- Bash
- PHP
- Apache
