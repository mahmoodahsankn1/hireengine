#!/usr/bin/env python
"""
Root convenience script to seed HireFlow demo data.
Usage:
    python seed.py [--reset] [--deadline-minutes 5] [--past-deadline] [--skip-processing]
"""
import os
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
API_DIR = BASE_DIR / 'src' / 'api'

if str(API_DIR) not in sys.path:
    sys.path.insert(0, str(API_DIR))

os.chdir(str(API_DIR))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'hireflow.settings')

def main():
    try:
        import django
        django.setup()
        from django.core.management import call_command
        call_command('seed_demo', *sys.argv[1:])
    except Exception as exc:
        print(f"Error seeding demo data: {exc}")
        sys.exit(1)

if __name__ == '__main__':
    main()
