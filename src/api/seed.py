#!/usr/bin/env python
import os
import sys

def main():
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'hireengine.settings')
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
