#!/bin/bash
service postgresql start
cd /workspace/Exact/exact
/workspace/.virtualenvs/exact/bin/python3 manage.py runserver
echo "Complete Exact startup"


