"""Restore the app's existing gateway credential after a local database reset.

Run inside the Open WebUI container, passing the configured key on stdin.
Never prints credentials. Refuses to assign a key to a non-admin account.
"""
import asyncio
import os
import sys

from open_webui.models.users import Users


async def main():
    key = sys.stdin.read().strip()
    if not key:
        raise RuntimeError("Configured gateway key is empty")
    user = await Users.get_user_by_email(os.environ["WEBUI_ADMIN_EMAIL"])
    if not user or user.role != "admin":
        raise RuntimeError("Configured gateway administrator does not exist")
    if not await Users.update_user_api_key_by_id(user.id, key):
        raise RuntimeError("Gateway credential restoration failed")
    print("Gateway credential restored")


asyncio.run(main())
