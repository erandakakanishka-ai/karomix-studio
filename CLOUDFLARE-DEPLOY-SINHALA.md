# Cloudflare වෙත විනාඩි 5න් නොමිලේ Deploy කරන පියවර 5 (Step-by-Step Guide)

ඔබට අලුතින් එකම Code පේළියක්වත් ලිවීමට අවශ්‍ය නැත! වෙනස් කිරීමට ඇත්තේ `wrangler.toml` ගොනුවේ **18 වන පේළියේ `database_id`** එක පමණි.

## පෙර සූදානම
1. [dash.cloudflare.com](https://dash.cloudflare.com) වෙත ගොස් නොමිලේ ගිණුමක් සාදාගන්න ($0 Free).
2. ඔබේ පරිගණකයේ [Node.js](https://nodejs.org) install කර තිබිය යුතුය.
3. `singvaza` ෆෝල්ඩරය Download කර VS Code හෝ Terminal එකෙන් විවෘත කරගන්න.

---

## Terminal Commands 5 (Copy-Paste කර Enter ඔබන්න)

### පියවර 1: Wrangler Tool එක install කරගැනීම
```bash
npm install
```

### පියවර 2: Cloudflare ගිණුමට Login වීම (Browser එක විවෘත වී Allow ඔබන්න එයි)
```bash
npx wrangler login
```

### පියවර 3: නොමිලේ D1 Database එක සෑදීම
```bash
npx wrangler d1 create karomix-db
```
👉 මෙම command එක ගැසූ පසු Terminal එකේ `database_id = "xxxx-xxxx-xxxx..."` ලෙස අංකයක් පෙන්වයි.
එම අංකය copy කර **`wrangler.toml`** ගොනුවේ `REPLACE_WITH_YOUR_D1_ID` වෙනුවට paste කර Save කරන්න!

### පියවර 4: Database Tables (`users`, `projects`, `custom_presets`) සෑදීම
```bash
npx wrangler d1 execute karomix-db --remote --file=./schema.sql
```

### පියවර 5: මුළු Studio App එකම Internet එකට Deploy කිරීම!
```bash
npx wrangler deploy
```

🎉 **අවසන්!** තත්පර 15කින් ඔබට `https://singvaza.<your-name>.workers.dev` ලෙස ලෝකයේ ඕනෑම තැනකින් Phone / PC වලින් වැඩ කරන Live HTTPS Link එක ලැබේ!
