# How to open the venv

source .venv/bin/activate

# HOW TO OPEN THE DATABASE FROM THE TERMINAL

psql postgres://app:app@127.0.0.1:5433/appdb

# Για να δεις tables

\dt

# Για να δεις συγκεκριμένο table

SELECT * FROM run_experiments LIMIT 1;
