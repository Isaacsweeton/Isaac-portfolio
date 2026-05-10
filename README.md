# Isaac Portfolio Pro Admin

Includes:
- Portfolio frontend
- Node.js + Express backend
- MongoDB Atlas support
- Admin login
- Project manager
- Hire request panel
- Notification badge
- Optional email alerts via SMTP

## Run locally
```bash
npm install
npm start
```

## Render Environment Variables
Required:
```env
MONGODB_URI=mongodb+srv://...
JWT_SECRET=change_this_secret_key
ADMIN_USER=isaac
ADMIN_PASS=07(Sweeton)07
```

Optional email alerts:
```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_gmail_app_password
ALERT_EMAIL=your_email@gmail.com
PUBLIC_SITE_URL=https://your-render-url.onrender.com
```
