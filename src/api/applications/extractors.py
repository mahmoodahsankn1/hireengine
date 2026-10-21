import re
import os
import pdfplumber
import docx

class ResumeExtractionError(Exception):
    """Raised when resume extraction fails due to formatting or encryption."""
    pass

class ScannedResumeError(Exception):
    """Raised when extracted resume text is insufficient (scanned/image CV)."""
    pass

def extract_text_from_pdf(file_obj) -> str:
    """
    Extracts text from a PDF file using pdfplumber.
    Raises ResumeExtractionError if unreadable, corrupted, or password-protected.
    """
    try:
        text_parts = []
        with pdfplumber.open(file_obj) as pdf:
            if pdf.is_encrypted:
                raise ResumeExtractionError("The uploaded PDF is password-protected or encrypted.")
            for page in pdf.pages:
                page_text = page.extract_text()
                if page_text:
                    text_parts.append(page_text)
        return "\n".join(text_parts).strip()
    except ResumeExtractionError:
        raise
    except Exception as exc:
        raise ResumeExtractionError(f"Unable to read PDF document: {str(exc)}")

def extract_text_from_docx(file_obj) -> str:
    """
    Extracts text from a DOCX file using python-docx.
    Extracts paragraphs and tables.
    """
    try:
        doc = docx.Document(file_obj)
        text_parts = []
        for p in doc.paragraphs:
            if p.text.strip():
                text_parts.append(p.text.strip())
        for table in doc.tables:
            for row in table.rows:
                row_texts = [cell.text.strip() for cell in row.cells if cell.text.strip()]
                if row_texts:
                    text_parts.append(" | ".join(row_texts))
        return "\n".join(text_parts).strip()
    except Exception as exc:
        raise ResumeExtractionError(f"Unable to read DOCX document: {str(exc)}")

def extract_resume_text(file_obj, filename: str) -> str:
    """
    Extracts plain text from a resume file (PDF or DOCX).
    Enforces minimum text length (200 characters) to filter out scanned documents.
    """
    lower_name = filename.lower()
    if lower_name.endswith('.pdf'):
        text = extract_text_from_pdf(file_obj)
    elif lower_name.endswith('.docx'):
        text = extract_text_from_docx(file_obj)
    else:
        raise ResumeExtractionError("Unsupported file type. Only PDF and DOCX files are supported.")

    # Rule: len(text.strip()) < 200 -> scanned files not supported
    if len(text.strip()) < 200:
        raise ScannedResumeError("scanned files not supported, upload text-based PDF/DOCX")

    return text

def regex_strip_pii(text: str) -> str:
    """
    Step 1 of CV anonymization per Phase 3 rules:
    Regex-strips emails, phone numbers, and URLs before passing text to the LLM.
    """
    # Strip URLs (http, https, www, linkedin, github profiles)
    text = re.sub(r'https?://\S+|www\.\S+', '[REDACTED_LINK]', text, flags=re.IGNORECASE)
    text = re.sub(r'(?:linkedin\.com|github\.com)/\S+', '[REDACTED_LINK]', text, flags=re.IGNORECASE)

    # Strip emails
    text = re.sub(r'[\w\.-]+@[\w\.-]+\.\w+', '[REDACTED_EMAIL]', text)

    # Strip phone numbers (various formats with +, spaces, hyphens, parentheses)
    # Matches patterns like +91 9876543210, (123) 456-7890, 98765-43210, etc.
    text = re.sub(r'(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}', '[REDACTED_PHONE]', text)
    text = re.sub(r'\b\d{10}\b', '[REDACTED_PHONE]', text)

    return text
