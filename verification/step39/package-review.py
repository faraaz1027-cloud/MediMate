"""Package only Step 39 edits, preserving the earlier dirty checkout."""
from pathlib import Path
import difflib
root=Path(__file__).resolve().parents[2]
out=root.parent/'Support'/'Step39_Review'
out.mkdir(parents=True,exist_ok=True)
app=(root/'client/src/App.jsx').read_text(encoding='utf-8')
after='''        {/* Reserve the same header geometry while the session is loading. */}
        <button
          className="quiet"
          style={{ visibility: user ? "visible" : "hidden" }}
          aria-hidden={!user || undefined}
          disabled={!user || busy}
          onClick={logout}
        >
          Sign out
        </button>'''
before='''        {user && (
          <button className="quiet" disabled={busy} onClick={logout}>
            Sign out
          </button>
        )}'''
assert app.count(after)==1
css=(root/'client/src/index.css').read_text(encoding='utf-8')
gutter='''/* Keep centered content still when session data makes the page scrollable. */
html {
  scrollbar-gutter: stable;
}
'''
assert css.count(gutter)==1
html=(root/'client/index.html').read_text(encoding='utf-8')
icon='    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />\n'
assert html.count(icon)==1
changes=[('client/src/App.jsx',app.replace(after,before),app),('client/src/index.css',css.replace(gutter,''),css),('client/index.html',html.replace(icon,''),html),('client/public/favicon.svg','',(root/'client/public/favicon.svg').read_text(encoding='utf-8'))]
patch=''
for name,old,new in changes:
    patch+='diff --git a/'+name+' b/'+name+'\n'
    if not old: patch+='new file mode 100644\n'
    patch+=''.join(difflib.unified_diff(old.splitlines(True),new.splitlines(True),fromfile='a/'+name if old else '/dev/null',tofile='b/'+name))
(out/'Step39_Frontend_Fixes.patch').write_text(patch,encoding='utf-8',newline='\n')
start=root.parent/'START_HERE.md'
entry='''
## Step 39 measured browser review — 21 November 2026
Branch: feature/step39-browser-performance. Genuine native Chrome DevTools and isolated Lighthouse measurements are recorded. Reserved Sign out space, stable scrollbar gutter and a local favicon fixed measured layout shifts/404. Reviewed mobile: performance 92, LCP 3.312s, CLS 0.043; desktop: 100, 0.688s, 0.018. Mobile LCP remains open. Native 360px/Slow 4G/offline/retry and Performance screenshots: Source/docs/evidence/step39/. Guide: Source/docs/STEP_39_BROWSER_PERFORMANCE.md. Build and existing integrated UI regression passed; Step 38 backend count is earlier evidence. Focused already-applied patch: Support/Step39_Review/Step39_Frontend_Fixes.patch. Existing Assignment 03 and earlier work preserved; no new commit/PR. Real-device/live integration/student/faculty gates remain separate. Next numbered step: Step 40 final documentation package.
'''
current=start.read_text(encoding='utf-8')
if '## Step 39 measured browser review' not in current:
    start.write_text(current+entry,encoding='utf-8')
print(out/'Step39_Frontend_Fixes.patch')
