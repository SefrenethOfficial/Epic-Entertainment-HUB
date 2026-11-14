# Switching on sign-ups (Supabase, free plan)

1. Make a free account at https://supabase.com and create a new project.
2. Open the project's **SQL Editor**, paste in everything from `setup.sql` (in this folder) and press **Run**.
3. In the project's **Authentication** settings:
   - either turn **off** "Confirm email" for the Email provider (people can sign up and play straight away),
   - or leave it on and set the **Site URL** to `https://sefrenethofficial.github.io/Epic-Entertainment-HUB/` so the confirmation link comes back to the HUB.
4. In the project's **API settings**, copy the **Project URL** and the **publishable** key (older projects call it "anon public") into `js/config.js`. Never use the secret / service_role key.
5. Open the HUB and sign up. **The first account to sign up becomes the Owner**, so do this before sharing the link.

After that:

- The Owner can turn Players into Admins (and back) from **Members**.
- Owners and Admins get an **Add a game** button: a link to a hosted game, or one uploaded `.html` file, plus an optional picture and up to 3 tags.
- To remove a HUB-added game, click the **X** on its window.
- Free Supabase projects pause after about a week with no activity. If sign-in stops working, open the Supabase dashboard and restore the project.
