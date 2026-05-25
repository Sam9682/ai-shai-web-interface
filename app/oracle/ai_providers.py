"""AI Provider implementations for Oracle"""
import asyncio
import time
import json
import re
from abc import ABC, abstractmethod
from typing import Optional, Dict, Any
import httpx
from app.config import settings
from app.logging_config import logger


def strip_ansi_codes(text: str) -> str:
    """Remove ANSI escape codes from text"""
    # Pattern to match ANSI escape sequences
    ansi_escape = re.compile(r'\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])')
    return ansi_escape.sub('', text)


class AIProvider(ABC):
    """Base class for AI providers"""
    
    @abstractmethod
    async def query(
        self,
        question: str,
        context: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 2000
    ) -> Dict[str, Any]:
        """Query the AI provider"""
        pass


class KiroAIProvider(AIProvider):
    """Kiro CLI AI Provider - Uses local Ubuntu session with kiro-cli"""
    
    async def query(
        self,
        question: str,
        context: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 2000
    ) -> Dict[str, Any]:
        """Query Kiro AI via CLI"""
        start_time = time.time()

        try:
            # Construct the prompt
            prompt = question
            if context:
                prompt = f"Contexte: {context}\n\nQuestion: {question}"

            # Set up environment with proper PATH
            import os
            env = os.environ.copy()
            # Ensure PATH includes Kiro CLI installation locations
            kiro_paths = [
                "/root/.local/bin",
                "/home/ubuntu/.local/bin",
                os.path.expanduser("~/.local/bin")
            ]
            current_path = env.get('PATH', '')
            env['PATH'] = ':'.join(kiro_paths + [current_path])

            # Check if kiro-cli is authenticated, if not skip authentication for now
            # The CLI should work without authentication for basic queries
            
            # Execute kiro-cli chat command with timeout
            process = await asyncio.create_subprocess_exec(
                'kiro-cli', 'chat', '--no-interactive', '--trust-all-tools', prompt,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=env
            )

            try:
                stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=60.0)
            except asyncio.TimeoutError:
                process.kill()
                logger.error("Kiro CLI timeout after 60 seconds")
                raise Exception("Kiro CLI timeout - la requête a pris trop de temps")

            output = stdout.decode().strip()
            error_output = stderr.decode().strip() if stderr else ""

            # Check for authentication errors and provide helpful message
            if "Failed to open browser" in output or "Failed to open browser" in error_output:
                logger.warning("Kiro CLI authentication issue - service may require manual authentication")
                raise Exception("Kiro CLI nécessite une authentification. Veuillez utiliser un autre fournisseur d'IA (OpenAI ou Shai) ou configurer l'authentification manuellement.")

            if process.returncode != 0:
                error_msg = error_output or output or "Unknown error"
                logger.error(f"Kiro CLI error: {error_msg}")

                # Check if kiro-cli is not installed
                if "not found" in error_msg or "command not found" in error_msg or "No such file or directory" in error_msg:
                    raise Exception("Kiro CLI n'est pas installé. Veuillez reconstruire le container Docker ou utiliser un autre fournisseur d'IA.")

                raise Exception(f"Kiro CLI a échoué: {error_msg}")

            # Strip ANSI escape codes only
            answer = strip_ansi_codes(output)

            if not answer:
                raise Exception("Kiro CLI n'a pas retourné de réponse")

            processing_time = time.time() - start_time

            return {
                "answer": answer,
                "processing_time": processing_time,
                "tokens_used": len(answer.split()),  # Approximation
                "provider": "kiro"
            }

        except Exception as e:
            logger.error(f"Kiro AI query failed: {str(e)}")
            raise


class ShaiAIProvider(AIProvider):
    """Shai CLI AI Provider - Uses local Ubuntu session with shai CLI"""
    
    async def query(
        self,
        question: str,
        context: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 2000
    ) -> Dict[str, Any]:
        """Query Shai AI via CLI"""
        start_time = time.time()

        try:
            prompt = question
            if context:
                prompt = f"Contexte: {context}\n\nQuestion: {question}"

            import os
            env = os.environ.copy()
            shai_paths = [
                "/root/.local/bin",
                "/home/ubuntu/.local/bin",
                os.path.expanduser("~/.local/bin")
            ]
            current_path = env.get('PATH', '')
            env['PATH'] = ':'.join(shai_paths + [current_path])

            process = await asyncio.create_subprocess_exec(
                'shai', prompt,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=env
            )

            try:
                stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=60.0)
            except asyncio.TimeoutError:
                process.kill()
                logger.error("Shai CLI timeout after 60 seconds")
                raise Exception("Shai CLI timeout - la requête a pris trop de temps")

            output = stdout.decode().strip()
            error_output = stderr.decode().strip() if stderr else ""

            if process.returncode != 0:
                error_msg = error_output or output or "Unknown error"
                logger.error(f"Shai CLI error: {error_msg}")

                if "not found" in error_msg or "command not found" in error_msg or "No such file or directory" in error_msg:
                    raise Exception("Shai CLI n'est pas installé. Veuillez reconstruire le container Docker ou utiliser un autre fournisseur d'IA.")

                raise Exception(f"Shai CLI a échoué: {error_msg}")

            answer = strip_ansi_codes(output)
            answer = answer.strip()
            
            lines = answer.split('\n')
            cleaned_lines = []
            skip_box = False
            
            for line in lines:
                if '╭' in line or '╰' in line or '│' in line:
                    skip_box = True
                    continue
                if skip_box and ('─' in line or not line.strip()):
                    continue
                skip_box = False
                
                if '▸ Time:' in line or line.strip().startswith('Time:'):
                    continue
                    
                cleaned_lines.append(line)
            
            answer = '\n'.join(cleaned_lines).strip()

            if not answer:
                raise Exception("Shai CLI n'a pas retourné de réponse")

            processing_time = time.time() - start_time

            return {
                "answer": answer,
                "processing_time": processing_time,
                "tokens_used": len(answer.split()),
                "provider": "shai"
            }

        except Exception as e:
            logger.error(f"Shai AI query failed: {str(e)}")
            raise


class OpenAIProvider(AIProvider):
    """OpenAI Provider - Fallback option"""
    
    def __init__(self):
        self.api_key = settings.OPENAI_API_KEY
        self.api_url = "https://api.openai.com/v1/chat/completions"
        self.model = settings.OPENAI_MODEL
    
    async def query(
        self,
        question: str,
        context: Optional[str] = None,
        temperature: float = 0.7,
        max_tokens: int = 2000
    ) -> Dict[str, Any]:
        """Query OpenAI API"""
        start_time = time.time()
        
        if not self.api_key:
            raise Exception("OPENAI_API_KEY n'est pas configurée. Veuillez ajouter OPENAI_API_KEY dans le fichier .env")
        
        try:
            messages = []
            if context:
                messages.append({"role": "system", "content": context})
            messages.append({"role": "user", "content": question})
            
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    self.api_url,
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json"
                    },
                    json={
                        "model": self.model,
                        "messages": messages,
                        "temperature": temperature,
                        "max_tokens": max_tokens
                    },
                    timeout=60.0
                )
                
                response.raise_for_status()
                data = response.json()
                
                answer = data["choices"][0]["message"]["content"]
                tokens_used = data["usage"]["total_tokens"]
                
                processing_time = time.time() - start_time
                
                return {
                    "answer": answer,
                    "processing_time": processing_time,
                    "tokens_used": tokens_used,
                    "provider": "openai"
                }
                
        except httpx.HTTPStatusError as e:
            logger.error(f"OpenAI HTTP error: {e.response.status_code} - {e.response.text}")
            raise Exception(f"Erreur OpenAI: {e.response.status_code} - Vérifiez votre clé API")
        except Exception as e:
            logger.error(f"OpenAI query failed: {str(e)}")
            raise


def get_ai_provider(provider_name: str) -> AIProvider:
    """Factory function to get AI provider instance"""
    providers = {
        "kiro": KiroAIProvider,
        "shai": ShaiAIProvider,
        "openai": OpenAIProvider
    }
    
    provider_class = providers.get(provider_name)
    if not provider_class:
        raise ValueError(f"Unknown AI provider: {provider_name}")
    
    return provider_class()
