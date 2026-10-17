# Reel 002 cover

`a_studio.html` is the posted cover: a three.js product shot of a generic laptop running the real `ollama run nimble --ask` command, on a light studio backdrop. `b_scale.html` (816 squares vs 9) and `c_inbox.html` (sorted email cards) are the alternates.

Render (needs `../reel` installed for puppeteer and three, plus `../reel/fonts`):

```bash
ln -s ../reel/node_modules node_modules && ln -s ../reel/fonts fonts && npm i three@0.186.1
node shoot.mjs a_studio.html cover.png 2   # 2160x3840, downscale to 1080x1920
```
Everything important sits inside y 240-1680, the 3:4 crop Instagram shows on the profile grid.
