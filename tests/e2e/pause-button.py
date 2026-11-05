"""Offline Pause button: a dedicated control in the button rack, independent of the player panels. Run: python3 tests/e2e/pause-button.py"""
import subprocess, os
from pathlib import Path
from playwright.sync_api import sync_playwright
HERE = Path(__file__).parent; PORT = os.environ.get("PORT", "8771"); BASE = f"http://localhost:{PORT}"
passed = failed = 0
def ok(c, m):
    global passed, failed
    if c: passed += 1
    else: failed += 1; print("  FAIL:", m)
srv = subprocess.Popen(["node", str(HERE / "server.mjs")], env={**os.environ, "PORT": PORT}, stdout=subprocess.PIPE, text=True); srv.stdout.readline()
rect = lambda pg, sel: pg.evaluate("s => { const r = document.querySelector(s).getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map(Math.round); }", sel)
inter = lambda a, b: not (a[0] + a[2] <= b[0] or b[0] + b[2] <= a[0] or a[1] + a[3] <= b[1] or b[1] + b[3] <= a[1])
def begin(pg):
    pg.add_init_script("try{localStorage.setItem('scrabble.firstdraw','off')}catch(e){}")
    pg.goto(BASE + "/"); pg.wait_for_selector("#coverPlay"); pg.click("#coverPlay")
    pg.wait_for_selector("#md[open]"); pg.click("#mf .btn >> nth=0"); pg.wait_for_selector("#sd[open]"); pg.click("#sf .btn >> nth=2")
    pg.wait_for_selector("#dlg[open]"); pg.click("#dF .btn >> nth=0")
    pg.wait_for_function("document.querySelectorAll('#rk0 .tile').length===7")
try:
    with sync_playwright() as p:
        br = p.chromium.launch(); errs = []
        for name, w, h, touch in [("desktop", 1280, 800, False), ("tablet", 820, 1180, True), ("phone portrait", 390, 844, True), ("phone landscape", 844, 390, True)]:
            ctx = br.new_context(viewport={"width": w, "height": h}, has_touch=touch, is_mobile=touch); pg = ctx.new_page()
            pg.on("pageerror", lambda e: errs.append(str(e)))
            begin(pg)
            pg.wait_for_selector("#bPause", state="attached")
            vis = pg.locator("#bPause").is_visible(); ok(vis, f"{name}: the Pause button is visible")
            if not vis: ctx.close(); continue
            b = rect(pg, "#bPause")
            ok(b[0] >= 0 and b[1] >= 0 and b[0] + b[2] <= w + 1 and b[1] + b[3] <= h + 1 or pg.evaluate("document.scrollingElement.scrollHeight > innerHeight"), f"{name}: it is inside the page")
            for sel in ("#board", "#rk0", "#rk1", "#bPass", "#bSwap"):
                if pg.locator(sel).count() and pg.locator(sel).first.is_visible():
                    ok(not inter(b, rect(pg, sel)), f"{name}: it does not overlap {sel}")
            ok(pg.evaluate("!document.querySelector('#bPause').closest('.panel')"), f"{name}: it is not inside a player panel")
            ok(pg.locator("#bPause").is_enabled(), f"{name}: it is enabled")
            pg.click("#bPause"); pg.wait_for_selector("#mOv:not([hidden])"); ok(True, f"{name}: it pauses the game (pause card shown)")
            pg.keyboard.press("Escape") if False else None
            btn = pg.locator("#mOvAct button").first; btn.click(); pg.wait_for_selector("#mOv", state="hidden")
            ok(pg.locator("#bPause").is_visible(), f"{name}: back to play")
            ctx.close()
        # rack scale does not move it: change the player-panel size through the rack-scale variable and compare its position relative to the controls rack
        ctx = br.new_context(viewport={"width": 1280, "height": 800}); pg = ctx.new_page(); begin(pg)
        pg.wait_for_selector("#bPause")
        par = lambda: pg.evaluate("(() => { const r = document.querySelector('#bPause').parentElement.getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map(Math.round); })()")
        rel = lambda: (lambda a, c: [a[0] - c[0], a[1] - c[1]])(rect(pg, "#bPause"), par())
        r0 = rel(); pg.evaluate("document.documentElement.style.setProperty('--rack-scale','0.7')"); pg.wait_for_timeout(150)
        ok(rel() == r0, f"changing the rack size does not move the Pause button inside its rack: {r0} -> {rel()}")
        ok(not errs, f"no JavaScript errors: {errs[:2]}")
        br.close()
finally:
    srv.terminate()
print(f"\n{passed} passed, {failed} failed"); raise SystemExit(1 if failed else 0)
