"""Storage service for file management
Feature: hypervisia-website
Validates Requirements 5.2, 5.6
"""
import os
import uuid
import logging
from pathlib import Path
from typing import Optional, Tuple

from app.config import settings

logger = logging.getLogger(__name__)


# Allowed MIME types for document uploads
ALLOWED_MIME_TYPES = {
    # PDF
    'application/pdf',
    # Word documents
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    # Excel spreadsheets
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    # Images
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
}


class StorageService:
    """Service for file storage operations
    
    Validates Requirements 5.2, 5.6:
    - Manages file upload, download, and deletion
    - Validates file size and mime types
    """
    
    def __init__(self):
        """Initialize storage service with upload directory"""
        self.upload_dir = Path(settings.UPLOAD_DIR)
        self.max_size = settings.MAX_UPLOAD_SIZE
        
        # Ensure upload directory exists
        self.upload_dir.mkdir(parents=True, exist_ok=True)
        logger.info(f"Storage service initialized with upload dir: {self.upload_dir}")
    
    def validate_file(self, file_size: int, mime_type: str) -> Tuple[bool, Optional[str]]:
        """Validate file size and mime type
        
        Validates Requirements 5.6:
        - Supports common file formats (PDF, DOCX, XLSX, images)
        
        Args:
            file_size: Size of file in bytes
            mime_type: MIME type of file
        
        Returns:
            Tuple of (is_valid, error_message)
        """
        # Check file size
        if file_size > self.max_size:
            max_mb = self.max_size / (1024 * 1024)
            return False, f"File size exceeds maximum allowed size of {max_mb}MB"
        
        # Check mime type
        if mime_type not in ALLOWED_MIME_TYPES:
            return False, f"File type {mime_type} is not supported"
        
        return True, None
    
    def save_file(self, file_content: bytes, original_filename: str) -> Tuple[str, str]:
        """Save file to storage
        
        Validates Requirements 5.2:
        - Stores uploaded files with unique filenames
        
        Args:
            file_content: Binary content of file
            original_filename: Original filename from upload
        
        Returns:
            Tuple of (unique_filename, file_path)
        """
        # Generate unique filename
        file_extension = Path(original_filename).suffix
        unique_filename = f"{uuid.uuid4()}{file_extension}"
        file_path = self.upload_dir / unique_filename
        
        # Write file to disk
        with open(file_path, 'wb') as f:
            f.write(file_content)
        
        logger.info(f"File saved: {unique_filename} (original: {original_filename})")
        return unique_filename, str(file_path)
    
    def get_file_path(self, filename: str) -> Optional[Path]:
        """Get full path to a stored file
        
        Args:
            filename: Stored filename
        
        Returns:
            Path object if file exists, None otherwise
        """
        file_path = self.upload_dir / filename
        if file_path.exists() and file_path.is_file():
            return file_path
        return None
    
    def delete_file(self, filename: str) -> bool:
        """Delete file from storage
        
        Validates Requirements 5.7:
        - Removes files from storage when documents are deleted
        
        Args:
            filename: Stored filename to delete
        
        Returns:
            True if file deleted successfully, False otherwise
        """
        try:
            file_path = self.upload_dir / filename
            if file_path.exists():
                file_path.unlink()
                logger.info(f"File deleted: {filename}")
                return True
            else:
                logger.warning(f"File not found for deletion: {filename}")
                return False
        except Exception as e:
            logger.error(f"Failed to delete file {filename}: {str(e)}", exc_info=True)
            return False


# Global storage service instance
storage_service = StorageService()
