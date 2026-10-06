# Two sign-in paths: Admin + Uploader

## What you get
- **Sign-in page** (email/password + Google). Anyone can create an account, but it stays **pending** until you approve it.
- **Admin (you):** the whole app works as it does now: reviews, archive, reports, export. You also get two new pages:
  - **Users:** approve, reject, or suspend accounts.
  - **Received documents:** every uploaded file with uploader, date, and status (new / in review / done). Opening one loads it into the review screen, and you start the review yourself, so no credits are spent automatically.
- **Uploader:** sees one page only, **Upload document** (PDF / Word / text, with optional learner name and a note), followed by a "received" message. They can't see reports, the archive, or other people's files. If they try any other page, they're sent back to the upload page.
- **Pending account:** sees "Your account is waiting for admin approval" and nothing else.

## Who is admin
The first account you sign in with (your email) is set as admin once in the database. Everyone else joins as an uploader.

## Technical details
- Tables: `user_roles` (admin/uploader enum + `has_role` security definer), `profiles` (email, approval status: pending/approved/rejected), `submissions` (uploader_id, file path, learner name, note, status). GRANTs + RLS: uploaders can insert their own submission only when approved; only admins can select or update.
- Private storage bucket `submissions`: an approved uploader can upload to their own folder; only admins can read.
- Routes: `/auth` (public), `_authenticated` gate, `/upload` (uploader), and admin-only `/`, `/reviews`, `/admin/users`, `/admin/submissions`. Role/approval checks use the database; `/api/audit` and `/api/reviews` also check the admin role on the server (bearer token).
- Existing review archive: tied to the admin account instead of the browser key, so it works on any device or domain. Existing records are migrated to your account.
- Enable email auth plus Google.

## Note
This is a medium-to-large change. Your current credit balance may not cover it all at once.
