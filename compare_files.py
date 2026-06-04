import os
import filecmp

files_to_compare = [
    ("index.html", "video_test/index.html"),
    ("style.css", "video_test/style.css"),
    ("js/app.js", "video_test/js/app.js"),
    ("js/timeline.js", "video_test/js/timeline.js"),
    ("js/renderer.js", "video_test/js/renderer.js"),
    ("js/exporter.js", "video_test/js/exporter.js"),
    ("js/state.js", "video_test/js/state.js"),
    ("js/ui.js", "video_test/js/ui.js"),
    ("js/overlays.js", "video_test/js/overlays.js")
]

for root_file, test_file in files_to_compare:
    if os.path.exists(root_file) and os.path.exists(test_file):
        are_same = filecmp.cmp(root_file, test_file, shallow=False)
        if are_same:
            print(f"{root_file} and {test_file} are IDENTICAL.")
        else:
            print(f"{root_file} and {test_file} are DIFFERENT.")
    else:
        print(f"Missing one or both: {root_file} vs {test_file}")
