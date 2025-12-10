# Telegram Vercel Bot

This repository contains a Telegram bot designed to run on Vercel as a webhook endpoint.

## What it does
- Asks users to join a channel and verify membership (uses CHANNEL_USERNAME).
- Displays a main inline menu with 3 buttons.
- For each button the bot asks for a user input (force-reply), then calls a configured URL with that input placed into query parameters.
- Sends the JSON response from the external service back to the user and shows the main menu again.

## Provided button URLs (pre-configured)
- BT1 -> https://freefire-api.vercel.app/get_player_stats?server=ind&uid={uid}&matchmode=RANKED&gamemode=br
- BT2 -> https://freefire-apis.vercel.app/get_player_personal_show?server=ind&uid={uid}
- BT3 -> https://freefire-apis.vercel.app/get_search_account_by_keyword?server=ind&keyword={keyword}

Replace values or change templates in `api/webhook.js` if needed.

## Deployment
1. Create a Vercel project from this repo.
2. Set the environment variables in Vercel:
   - TELEGRAM_BOT_TOKEN
   - CHANNEL_USERNAME (example: @zxreep)
3. Deploy.
4. Set the Telegram webhook:

```
https://api.telegram.org/bot<YOUR_TOKEN>/setWebhook?url=https://<your-vercel-app>.vercel.app/api/webhook
```

## Notes
- Telegram requires a channel/group username (like @yourchannel) to verify membership via `getChatMember`.
- The bot must be added as an admin in the target channel/group for reliable verification.
- The bot uses the Node 18 global fetch API.
