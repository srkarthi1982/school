import logging
import re

from app.core.config import settings

logger = logging.getLogger(__name__)


def authenticate_ldap(username: str, password: str) -> dict | None:
    """Authenticate user via LDAP. Returns user info dict or None."""
    if settings.LDAP_MOCK:
        return None

    try:
        from ldap3 import ALL, Connection, Server

        server = Server(settings.LDAP_SERVER, get_info=ALL)
        domain = convert_dc_pattern(settings.LDAP_BASE_DN)
        user_with_domain = username
        if not re.search(r'@\w+', username):
            user_with_domain = username + domain
        # user_dn = settings.LDAP_USER_DN_TEMPLATE.format(username=username)
        conn = Connection(server, user=user_with_domain, password=password)

        if not conn.bind():
            logger.info("LDAP bind failed for username=%s", username)
            return None

        # search_filter = settings.LDAP_SEARCH_FILTER.format(username=user_with_domain)
        # conn.search(settings.LDAP_BASE_DN, search_filter, attributes=["cn", "mail", "uid"])

        # if not conn.entries:
        #     logger.warning("LDAP bind OK but no entry found for username=%s", username)
        #     conn.unbind()
        #     return None

        # entry = conn.entries[0]
        # user_info = {
        #     "username": str(entry.uid) if hasattr(entry, "uid") else username,
        #     "full_name": str(entry.cn) if hasattr(entry, "cn") else username,
        #     "email": str(entry.mail) if hasattr(entry, "mail") else f"{username}@ldap.local",
        # }
        user_info = {
            "username": username,
            "full_name": username,
            "email": user_with_domain
        }

        conn.unbind()
        logger.info("LDAP authentication success for username=%s", username)
        return user_info

    except Exception:
        logger.exception("LDAP error for username=%s", username)
        return None

def convert_dc_pattern(pattern):
    """
    Converts a DC pattern string (e.g., 'dc=jac,dc=mil,dc=ae')
    into an email-like domain format (e.g., '@jac.mil.ae').

    Args:
        pattern (str): Input string with comma-separated 'dc=value' pairs.

    Returns:
        str: Converted string starting with '@' followed by dot-separated values.
    """
    parts = pattern.split(',')
    domains = [part.split('=')[1] for part in parts if '=' in part]
    return '@' + '.'.join(domains)
