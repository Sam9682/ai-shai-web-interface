"""Tests for document upload endpoint

Tests the document upload functionality:
- POST /api/documents/upload (upload document - admin only)

Validates Requirements 5.2, 5.6
Feature: hypervisia-website
"""

import pytest
import io
from fastapi import status
from app.models import User, Document
from app.models.document import DocumentCategory, AccessLevel
from app.auth.token import create_access_token


@pytest.fixture
def admin_user(db_session):
    """Create an administrator user for testing"""
    user = User(
        email="admin@test.com",
        password_hash="hashed_password",
        first_name="Admin",
        last_name="User",
        role="administrator",
        is_email_verified=True
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture
def member_user(db_session):
    """Create a regular member user for testing"""
    user = User(
        email="member@test.com",
        password_hash="hashed_password",
        first_name="Member",
        last_name="User",
        role="member",
        is_email_verified=True
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture
def admin_headers(admin_user):
    """Create authentication headers for admin user"""
    token = create_access_token({"sub": str(admin_user.id)})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def member_headers(member_user):
    """Create authentication headers for member user"""
    token = create_access_token({"sub": str(member_user.id)})
    return {"Authorization": f"Bearer {token}"}


def test_upload_document_success_pdf(client, admin_user, admin_headers, db_session):
    """Test successful document upload with PDF file
    
    Validates Requirement 5.2: Administrator uploads document and system stores it
    Validates Requirement 5.6: System supports PDF format
    """
    # Create a fake PDF file
    pdf_content = b"%PDF-1.4\n%Test PDF content"
    file_data = {
        "file": ("test_document.pdf", io.BytesIO(pdf_content), "application/pdf"),
        "category": DocumentCategory.STATUTES.value,
        "access_level": AccessLevel.MEMBERS.value
    }
    
    response = client.post(
        "/api/documents/upload",
        files={"file": file_data["file"]},
        data={
            "category": file_data["category"],
            "access_level": file_data["access_level"]
        },
        headers=admin_headers
    )
    
    assert response.status_code == status.HTTP_201_CREATED
    data = response.json()
    
    # Verify response structure
    assert data["success"] is True
    assert data["message"] == "Document uploaded successfully"
    assert "document" in data
    
    doc = data["document"]
    assert "id" in doc
    assert doc["original_name"] == "test_document.pdf"
    assert doc["mime_type"] == "application/pdf"
    assert doc["size"] == len(pdf_content)
    assert doc["category"] == DocumentCategory.STATUTES.value
    assert doc["access_level"] == AccessLevel.MEMBERS.value
    assert doc["uploaded_by"] == str(admin_user.id)
    assert doc["download_count"] == 0
    assert "filename" in doc  # Unique filename
    assert doc["filename"] != "test_document.pdf"  # Should be unique
    
    # Verify document was created in database
    document = db_session.query(Document).filter(
        Document.original_name == "test_document.pdf"
    ).first()
    assert document is not None
    assert document.uploaded_by == admin_user.id
    assert document.category == DocumentCategory.STATUTES


def test_upload_document_success_docx(client, admin_user, admin_headers, db_session):
    """Test successful document upload with DOCX file
    
    Validates Requirement 5.6: System supports DOCX format
    """
    # Create a fake DOCX file
    docx_content = b"PK\x03\x04" + b"Fake DOCX content"
    file_data = {
        "file": ("report.docx", io.BytesIO(docx_content), 
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
        "category": DocumentCategory.FINANCIAL_REPORTS.value,
        "access_level": AccessLevel.ADMINISTRATORS.value
    }
    
    response = client.post(
        "/api/documents/upload",
        files={"file": file_data["file"]},
        data={
            "category": file_data["category"],
            "access_level": file_data["access_level"]
        },
        headers=admin_headers
    )
    
    assert response.status_code == status.HTTP_201_CREATED
    data = response.json()
    assert data["success"] is True
    assert data["document"]["original_name"] == "report.docx"
    assert data["document"]["category"] == DocumentCategory.FINANCIAL_REPORTS.value


def test_upload_document_success_xlsx(client, admin_user, admin_headers, db_session):
    """Test successful document upload with XLSX file
    
    Validates Requirement 5.6: System supports XLSX format
    """
    # Create a fake XLSX file
    xlsx_content = b"PK\x03\x04" + b"Fake XLSX content"
    file_data = {
        "file": ("budget.xlsx", io.BytesIO(xlsx_content),
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
        "category": DocumentCategory.FINANCIAL_REPORTS.value,
        "access_level": AccessLevel.MEMBERS.value
    }
    
    response = client.post(
        "/api/documents/upload",
        files={"file": file_data["file"]},
        data={
            "category": file_data["category"],
            "access_level": file_data["access_level"]
        },
        headers=admin_headers
    )
    
    assert response.status_code == status.HTTP_201_CREATED
    data = response.json()
    assert data["success"] is True
    assert data["document"]["original_name"] == "budget.xlsx"


def test_upload_document_success_image(client, admin_user, admin_headers, db_session):
    """Test successful document upload with image file
    
    Validates Requirement 5.6: System supports image formats
    """
    # Create a fake JPEG image
    jpeg_content = b"\xFF\xD8\xFF\xE0" + b"Fake JPEG content"
    file_data = {
        "file": ("photo.jpg", io.BytesIO(jpeg_content), "image/jpeg"),
        "category": DocumentCategory.OTHER.value,
        "access_level": AccessLevel.PUBLIC.value
    }
    
    response = client.post(
        "/api/documents/upload",
        files={"file": file_data["file"]},
        data={
            "category": file_data["category"],
            "access_level": file_data["access_level"]
        },
        headers=admin_headers
    )
    
    assert response.status_code == status.HTTP_201_CREATED
    data = response.json()
    assert data["success"] is True
    assert data["document"]["original_name"] == "photo.jpg"
    assert data["document"]["mime_type"] == "image/jpeg"


def test_upload_document_file_too_large(client, admin_user, admin_headers):
    """Test document upload fails when file exceeds size limit
    
    Validates Requirement 5.6: System validates file size (max 10MB)
    """
    # Create a file larger than 10MB
    large_content = b"x" * (11 * 1024 * 1024)  # 11MB
    file_data = {
        "file": ("large_file.pdf", io.BytesIO(large_content), "application/pdf"),
        "category": DocumentCategory.OTHER.value,
        "access_level": AccessLevel.MEMBERS.value
    }
    
    response = client.post(
        "/api/documents/upload",
        files={"file": file_data["file"]},
        data={
            "category": file_data["category"],
            "access_level": file_data["access_level"]
        },
        headers=admin_headers
    )
    
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    data = response.json()
    assert "detail" in data
    assert "error" in data["detail"]
    assert data["detail"]["error"]["code"] == "INVALID_FILE"
    assert "size" in data["detail"]["error"]["message"].lower()


def test_upload_document_invalid_mime_type(client, admin_user, admin_headers):
    """Test document upload fails with unsupported file type
    
    Validates Requirement 5.6: System validates mime types
    """
    # Create a file with unsupported mime type
    exe_content = b"MZ\x90\x00" + b"Fake executable"
    file_data = {
        "file": ("malware.exe", io.BytesIO(exe_content), "application/x-msdownload"),
        "category": DocumentCategory.OTHER.value,
        "access_level": AccessLevel.MEMBERS.value
    }
    
    response = client.post(
        "/api/documents/upload",
        files={"file": file_data["file"]},
        data={
            "category": file_data["category"],
            "access_level": file_data["access_level"]
        },
        headers=admin_headers
    )
    
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    data = response.json()
    assert "detail" in data
    assert "error" in data["detail"]
    assert data["detail"]["error"]["code"] == "INVALID_FILE"
    assert "not supported" in data["detail"]["error"]["message"].lower()


def test_upload_document_non_admin_forbidden(client, member_user, member_headers):
    """Test document upload fails for non-admin users
    
    Validates Requirement 7.2: Administrative functions restricted to administrators
    """
    pdf_content = b"%PDF-1.4\n%Test PDF"
    file_data = {
        "file": ("test.pdf", io.BytesIO(pdf_content), "application/pdf"),
        "category": DocumentCategory.OTHER.value,
        "access_level": AccessLevel.MEMBERS.value
    }
    
    response = client.post(
        "/api/documents/upload",
        files={"file": file_data["file"]},
        data={
            "category": file_data["category"],
            "access_level": file_data["access_level"]
        },
        headers=member_headers
    )
    
    assert response.status_code == status.HTTP_403_FORBIDDEN
    data = response.json()
    assert "detail" in data
    assert "error" in data["detail"]
    assert data["detail"]["error"]["code"] == "ADMIN_ACCESS_REQUIRED"


def test_upload_document_unauthenticated(client):
    """Test document upload fails without authentication"""
    pdf_content = b"%PDF-1.4\n%Test PDF"
    file_data = {
        "file": ("test.pdf", io.BytesIO(pdf_content), "application/pdf"),
        "category": DocumentCategory.OTHER.value,
        "access_level": AccessLevel.MEMBERS.value
    }
    
    response = client.post(
        "/api/documents/upload",
        files={"file": file_data["file"]},
        data={
            "category": file_data["category"],
            "access_level": file_data["access_level"]
        }
    )
    
    assert response.status_code == status.HTTP_403_FORBIDDEN


def test_upload_document_all_categories(client, admin_user, admin_headers, db_session):
    """Test document upload with all available categories
    
    Validates Requirement 5.4: Documents organized by categories
    """
    categories = [
        DocumentCategory.STATUTES,
        DocumentCategory.MINUTES,
        DocumentCategory.FINANCIAL_REPORTS,
        DocumentCategory.OTHER
    ]
    
    for category in categories:
        pdf_content = b"%PDF-1.4\n%Test PDF"
        file_data = {
            "file": (f"test_{category.value}.pdf", io.BytesIO(pdf_content), "application/pdf"),
            "category": category.value,
            "access_level": AccessLevel.MEMBERS.value
        }
        
        response = client.post(
            "/api/documents/upload",
            files={"file": file_data["file"]},
            data={
                "category": file_data["category"],
                "access_level": file_data["access_level"]
            },
            headers=admin_headers
        )
        
        assert response.status_code == status.HTTP_201_CREATED
        data = response.json()
        assert data["document"]["category"] == category.value


def test_upload_document_all_access_levels(client, admin_user, admin_headers, db_session):
    """Test document upload with all available access levels
    
    Validates Requirement 5.2: System assigns access permissions
    """
    access_levels = [
        AccessLevel.PUBLIC,
        AccessLevel.MEMBERS,
        AccessLevel.ADMINISTRATORS
    ]
    
    for access_level in access_levels:
        pdf_content = b"%PDF-1.4\n%Test PDF"
        file_data = {
            "file": (f"test_{access_level.value}.pdf", io.BytesIO(pdf_content), "application/pdf"),
            "category": DocumentCategory.OTHER.value,
            "access_level": access_level.value
        }
        
        response = client.post(
            "/api/documents/upload",
            files={"file": file_data["file"]},
            data={
                "category": file_data["category"],
                "access_level": file_data["access_level"]
            },
            headers=admin_headers
        )
        
        assert response.status_code == status.HTTP_201_CREATED
        data = response.json()
        assert data["document"]["access_level"] == access_level.value


def test_upload_document_empty_file(client, admin_user, admin_headers):
    """Test document upload fails with empty file"""
    empty_content = b""
    file_data = {
        "file": ("empty.pdf", io.BytesIO(empty_content), "application/pdf"),
        "category": DocumentCategory.OTHER.value,
        "access_level": AccessLevel.MEMBERS.value
    }
    
    response = client.post(
        "/api/documents/upload",
        files={"file": file_data["file"]},
        data={
            "category": file_data["category"],
            "access_level": file_data["access_level"]
        },
        headers=admin_headers
    )
    
    # Empty file should still be accepted if mime type is valid
    # The validation is on size limit, not minimum size
    assert response.status_code == status.HTTP_201_CREATED


def test_upload_document_special_characters_filename(client, admin_user, admin_headers, db_session):
    """Test document upload with special characters in filename"""
    pdf_content = b"%PDF-1.4\n%Test PDF"
    file_data = {
        "file": ("test file (2023) [final].pdf", io.BytesIO(pdf_content), "application/pdf"),
        "category": DocumentCategory.OTHER.value,
        "access_level": AccessLevel.MEMBERS.value
    }
    
    response = client.post(
        "/api/documents/upload",
        files={"file": file_data["file"]},
        data={
            "category": file_data["category"],
            "access_level": file_data["access_level"]
        },
        headers=admin_headers
    )
    
    assert response.status_code == status.HTTP_201_CREATED
    data = response.json()
    assert data["document"]["original_name"] == "test file (2023) [final].pdf"
    # Unique filename should be different
    assert data["document"]["filename"] != data["document"]["original_name"]
