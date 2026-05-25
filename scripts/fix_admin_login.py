#!/usr/bin/env python3
import os
os.environ['DATABASE_URL'] = 'postgresql://hypervisia_user:hypervisia_password@localhost:5432/hypervisia_db'

import sys
sys.path.insert(0, '/home/ubuntu/ai-hypervisia')

from app.database import SessionLocal
from app.models import User, UserRole
from app.auth.password import hash_password

db = SessionLocal()

try:
    # Check for typo email
    user = db.query(User).filter(User.email == 'admin@hypervisia.fr').first()
    
    if user:
        print(f"User {user.email} found")
        if not user.is_email_verified:
            user.is_email_verified = True
            db.commit()
            print("✅ Email verified")
        else:
            print("✅ Email already verified")
    else:
        print("Creating admin@hypervisia.fr user...")
        user = User(
            email='admin@hypervisia.fr',
            password_hash=hash_password('Admin1234!'),
            first_name='Admin',
            last_name='HYPERVISIA',
            role=UserRole.ADMINISTRATOR,
            is_email_verified=True
        )
        db.add(user)
        db.commit()
        print("✅ User created and verified")
    
    print(f"\nLogin: admin@hypervisia.fr")
    print(f"Password: Admin1234!")
    
finally:
    db.close()
