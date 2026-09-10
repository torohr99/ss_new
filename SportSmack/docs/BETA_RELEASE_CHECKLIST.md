# SportSmack Beta Release Checklist

## Backend

- [ ] Production environment variables verified
- [ ] NODE_ENV=production
- [ ] Redis connected
- [ ] PostgreSQL connected
- [ ] /health returns 200
- [ ] /api/status returns healthy
- [ ] Socket.IO connections work
- [ ] Live Gamecast works
- [ ] Live polls work
- [ ] AI Gamecast works
- [ ] Fantasy scoring works
- [ ] Waivers work
- [ ] Trades work
- [ ] Moderation works
- [ ] Admin metrics work
- [ ] Account authentication works
- [ ] Email verification works

## Frontend

- [ ] Production build succeeds
- [ ] Login works
- [ ] Registration works
- [ ] Email verification works
- [ ] Logout works
- [ ] Feed loads
- [ ] Team pages load
- [ ] Game pages load
- [ ] Game chat works
- [ ] Fantasy works
- [ ] AI features work
- [ ] Meme generator works
- [ ] Mobile layout checked
- [ ] 404 page checked
- [ ] Error boundary checked
- [ ] Loading states checked

## Security

- [ ] HTTPS only in production
- [ ] No secrets committed to GitHub
- [ ] Authentication protected routes verified
- [ ] Admin routes verified
- [ ] Rate limits verified
- [ ] CORS verified
- [ ] XSS protection verified
- [ ] Helmet enabled
- [ ] Moderation/reporting verified

## Deployment

- [ ] GitHub main branch green
- [ ] Backend deployment successful
- [ ] Worker deployment successful
- [ ] Frontend deployment successful
- [ ] Render health check passing
- [ ] Production smoke tests passing
- [ ] No critical errors in Render logs
- [ ] No critical errors in Vercel logs

## Beta

- [ ] Test accounts created
- [ ] Beta users invited
- [ ] Feedback mechanism ready
- [ ] Bug reporting process ready
- [ ] Critical bug rollback plan ready
