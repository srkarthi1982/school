
def authenticate_ldap(username: str, password: str) -> dict | None:
    user_dir = {
        'gal2735': {'user_id': 'amir', 'pass': '123', 'email': 'amir@jac.mil.ae'},
        'gal2741': {'user_id': 'gal2741', 'pass': '123', 'email': 'gal2741@jac.mil.ae'},
        'gal7535': {'user_id': 'gal7535', 'pass': '123', 'email': 'gal7535@jac.mil.ae'},
        'gal7634': {'user_id': 'gal7634', 'pass': '123', 'email': 'gal7634@jac.mil.ae'},
        'gal8311': {'user_id': 'gal8311', 'pass': '123', 'email': 'gal8311@jac.mil.ae'},
        'gal9147': {'user_id': 'gal9147', 'pass': '123', 'email': 'gal9147@jac.mil.ae'},
        'gal22100': {'user_id': 'gal22100', 'pass': '123', 'email': 'gal22100@jac.mil.ae'},
        'gal25541': {'user_id': 'gal25541', 'pass': '123', 'email': 'gal25541@jac.mil.ae'},
        '0090': {'user_id': '0090', 'pass': '123', 'email': '0090@jac.mil.ae'},
    }
    user_record = user_dir.get(username.lower(), None)
    if not user_record:
        return None

    if user_record['pass'] != password:
        return None

    return {
        "username": username,
        "full_name": username,
        "email": user_record['email']
    }
