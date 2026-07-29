from requests import get, post
from requests.exceptions import RequestException
from app.core.config import settings

import logging

logger = logging.getLogger(__name__)
class EsnaadService:

    _api_key:str = settings.ESNAAD_API_KEY
    _api_url:str = settings.ESNAAD_BASE_URL

    @classmethod
    def get(cls, url_path: str):
        try:
            response = get(f'{cls._api_url}/{url_path}', headers={
                'Content-Type': 'application/json',
                'Authorization': f'Bearer {cls._api_key}',
                'Accept': 'application/json'
            },verify=False)
            response.raise_for_status()
            return response.json()
        except RequestException as e:                
            logger.error(f'Error occurred when making request to {cls._api_url}/{url_path}. Status Code: {e.response.status_code if e.response else None}, Message: {e.strerror}, {e.errno}')
            return None
    
    @classmethod
    def post(cls, url_path: str):
        try:
            response = post(f'{cls._api_url}/{url_path}', headers={
                'Content-Type': 'application/json',
                'Authorization': f'Bearer {cls._api_key}',
                'Accept': 'application/json'
            },verify=False)
            response.raise_for_status()
            return response.json()
        except RequestException as e:                
            logger.error(f'Error occurred when making request to {cls._api_url}/{url_path}. Status Code: {e.response.status_code if e.response else None}, Message: {e.strerror}, {e.errno}')
            return None
