# Google OAuth Setup Guide for MaterialMate

This guide will help you set up Google OAuth login and registration for your MaterialMate application.

## Step 1: Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Sign in with your Google account
3. Click on the project dropdown at the top
4. Click "NEW PROJECT"
5. Enter "MaterialMate" as the project name
6. Click "CREATE"
7. Wait for the project to be created

## Step 2: Set Up OAuth 2.0 Credentials

1. In the Google Cloud Console, click on "Credentials" in the left sidebar
2. Click "CREATE CREDENTIALS" and select "OAuth 2.0 Client ID"
3. You may be prompted to create an OAuth consent screen first:
   - Click "CONFIGURE CONSENT SCREEN"
   - Select "External" as the user type
   - Click "CREATE"
   - Fill in the required fields:
     - App name: "MaterialMate"
     - User support email: Your email
     - Developer contact: Your email
   - Click "SAVE AND CONTINUE"
   - Skip optional scopes, click "SAVE AND CONTINUE"
   - Review and click "BACK TO DASHBOARD"

4. Now click "CREATE CREDENTIALS" > "OAuth 2.0 Client ID" again
5. Select "Web application"
6. Under "Authorized JavaScript origins", add:
   - `http://localhost:5173` (for development)
   - `http://localhost:3000` (if you use this port)
7. Under "Authorized redirect URIs", add:
   - `http://localhost:5173`
   - `http://localhost:3000`
8. Click "CREATE"
9. Copy your **Client ID** - you'll need this in the next steps

## Step 3: Configure Client-Side Environment

1. Open `mm/client/.env.local`
2. Replace the placeholder with your actual Google Client ID:
   ```
   VITE_GOOGLE_CLIENT_ID=YOUR_ACTUAL_CLIENT_ID_HERE
   ```

## Step 4: Configure Server-Side Environment

1. Open `mm/server/.env`
2. Replace the placeholder with your actual Google Client ID:
   ```
   GOOGLE_CLIENT_ID=YOUR_ACTUAL_CLIENT_ID_HERE
   ```

## Step 5: Run the Application

### Terminal 1 - Start the Server
```bash
cd mm/server
npm install
node server.js
```

The server will run on `http://localhost:5000`

### Terminal 2 - Start the Client
```bash
cd mm/client
npm install
npm run dev
```

The client will run on `http://localhost:5173`

## Step 6: Test Google Login

1. Open your browser to `http://localhost:5173`
2. You should see login and register forms with "Login with Google" and "Sign up with Google" buttons
3. Click the Google button to test the OAuth flow
4. Sign in with your Google account
5. You should be redirected to the MaterialMate application

## Troubleshooting

### "Invalid Client ID" Error
- Make sure you've copied the exact Client ID from Google Cloud Console
- Verify it's in both `.env.local` (client) and `.env` (server)
- Restart both the client and server after changing the Client ID

### CORS Errors
- Make sure your localhost URLs are added to "Authorized JavaScript origins" in Google Cloud Console
- Clear your browser cache and restart the dev servers

### "Redirect URI Mismatch"
- Verify that the redirect URIs in Google Cloud Console match your localhost ports
- If you're using different ports, add them to the authorized URIs

## Features

✅ **Google Login** - Existing users can login with Google  
✅ **Google Registration** - New users can sign up with Google  
✅ **Auto Username Generation** - Username is created from email prefix  
✅ **Duplicate Account Prevention** - Same Google account can't register twice  
✅ **Mixed Authentication** - Users can have both traditional and Google auth  

## Security Notes

- The Google Client ID is safe to expose in frontend code
- Server-side token verification ensures security
- Users are stored with their Google ID for proper authentication
- Passwords are not required for Google OAuth users

## Production Deployment

When deploying to production:

1. Update Supabase Authentication URL Configuration:
   - Site URL: `https://material-mate.vercel.app`
   - Redirect URLs: `https://material-mate.vercel.app/**`
   - Keep localhost redirect URLs only if you still need local development.
2. Update your Google Cloud Console credentials:
   - Add `https://material-mate.vercel.app` to "Authorized JavaScript origins"
   - Add `https://material-mate.vercel.app` to "Authorized redirect URIs"
3. Update environment variables:
   - `VITE_AUTH_REDIRECT_URL=https://material-mate.vercel.app`
   - `VITE_GOOGLE_CLIENT_ID=your_production_client_id`
   - `GOOGLE_CLIENT_ID=your_production_client_id`
4. Consider using a production JWT_SECRET (change from default in server.js)
