CREATE USER 'project_socket'@'localhost' IDENTIFIED VIA unix_socket;
GRANT role_readonly TO 'project_socket'@'localhost';
SET DEFAULT ROLE role_readonly FOR 'project_socket'@'localhost';
