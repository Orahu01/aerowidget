// AeroWidget — 設定画面 (v3)
'use strict';

const PRESETS = {
  aurora: { label: 'オーロラ', css: `radial-gradient(45% 60% at 18% 82%, rgba(56,110,240,.55), transparent 65%), radial-gradient(50% 55% at 82% 20%, rgba(20,190,180,.4), transparent 65%), radial-gradient(55% 65% at 70% 85%, rgba(120,80,220,.45), transparent 65%), linear-gradient(155deg, #070b18, #0b1228 55%, #081120)` },
  sunset: { label: 'サンセット', css: `radial-gradient(50% 60% at 20% 85%, rgba(255,120,90,.5), transparent 65%), radial-gradient(55% 60% at 80% 25%, rgba(255,180,90,.35), transparent 60%), radial-gradient(60% 70% at 65% 80%, rgba(190,70,140,.4), transparent 65%), linear-gradient(155deg, #190f1e, #2a1226 55%, #190c18)` },
  midnight: { label: 'ミッドナイト', css: `radial-gradient(60% 80% at 70% 20%, rgba(40,70,160,.28), transparent 65%), radial-gradient(50% 60% at 20% 80%, rgba(30,50,110,.22), transparent 65%), linear-gradient(170deg, #05070d, #090d1a 60%, #05070d)` },
  sakura: { label: 'サクラ', css: `radial-gradient(50% 60% at 22% 80%, rgba(240,120,170,.38), transparent 65%), radial-gradient(55% 60% at 80% 22%, rgba(200,140,240,.3), transparent 62%), radial-gradient(60% 70% at 70% 85%, rgba(255,170,190,.25), transparent 65%), linear-gradient(155deg, #1c1220, #2a1626 55%, #1b1020)` },
  forest: { label: 'フォレスト', css: `radial-gradient(50% 60% at 20% 82%, rgba(30,160,120,.35), transparent 65%), radial-gradient(55% 60% at 82% 22%, rgba(90,180,90,.22), transparent 62%), radial-gradient(60% 70% at 68% 85%, rgba(20,110,110,.35), transparent 65%), linear-gradient(155deg, #08120e, #0c1c16 55%, #081410)` },
  mono: { label: 'モノトーン', css: `radial-gradient(60% 75% at 30% 25%, rgba(255,255,255,.06), transparent 60%), linear-gradient(160deg, #101014, #16161c 55%, #0e0e12)` },
};

const TYPES = {
  clock: { icon: 'i-clock', label: '時計 (デジタル)' },
  analog: { icon: 'i-analog', label: '時計 (アナログ)' },
  date: { icon: 'i-date', label: '日付' },
  calendar: { icon: 'i-caldays', label: 'カレンダー' },
  weather: { icon: 'i-weather', label: '天気' },
  text: { icon: 'i-text', label: 'テキスト' },
  image: { icon: 'i-photo', label: '画像' },
  stats: { icon: 'i-stats', label: 'ハードウェアモニタ' },
  nowplaying: { icon: 'i-music', label: '再生中の曲' },
  volume: { icon: 'i-volume', label: '音量・出力切替' },
  countdown: { icon: 'i-flag', label: 'カウントダウン' },
  rss: { icon: 'i-rss', label: 'ニュース (RSS)' },
  ticker: { icon: 'i-trend', label: '株価・為替' },
  note: { icon: 'i-note', label: 'メモ (書き込める付箋)' },
  todo: { icon: 'i-todo', label: 'ToDo リスト' },
  switcher: { icon: 'i-layers', label: '切り替えボタン' },
  modeswitch: { icon: 'i-check', label: 'モード切替ボタン' },
  pomo: { icon: 'i-timer', label: 'ポモドーロタイマー' },
  forecast: { icon: 'i-weather', label: '天気予報 (時間別・週間)' },
  ics: { icon: 'i-calcheck', label: '予定表 (カレンダー購読)' },
  worldclock: { icon: 'i-globe', label: '世界時計' },
  battery: { icon: 'i-battery', label: 'バッテリー' },
  disk: { icon: 'i-hdd', label: 'ディスク空き容量' },
  netinfo: { icon: 'i-wifi', label: 'ネットワーク情報' },
  visualizer: { icon: 'i-wave', label: 'ビジュアライザー' },
  zone: { icon: 'i-zone', label: 'ゾーン (色分け枠)' },
  line: { icon: 'i-line', label: 'ライン (線)' },
  folder: { icon: 'i-folder', label: 'フォルダ (アプリまとめ)' },
};

const FALLBACK_FONTS = [
  'Segoe UI', 'Segoe UI Light', 'Yu Gothic UI', 'Yu Gothic', 'Yu Mincho', 'Meiryo', 'MS Gothic',
  'BIZ UDGothic', 'BIZ UDPGothic', 'UD Digi Kyokasho N-R', 'Consolas', 'Cascadia Code', 'Courier New',
  'Arial', 'Arial Black', 'Bahnschrift', 'Calibri', 'Cambria', 'Candara', 'Century Gothic', 'Comic Sans MS',
  'Constantia', 'Corbel', 'Georgia', 'Impact', 'Lucida Console', 'Malgun Gothic', 'Palatino Linotype',
  'Segoe Print', 'Segoe Script', 'Sylfaen', 'Tahoma', 'Times New Roman', 'Trebuchet MS', 'Verdana',
];

const MAX_CUSTOM_COLORS = 10;

// ---------------------------------------------------------------- i18n
// 日本語を正とし、英語は日→英辞書で差し替える。
const JA_EN = {
  // v5.2 自動バックアップ / 先行版
  '自動バックアップ': 'Automatic backup',
  '保存先を開く': 'Open folder',
  'アプリのバージョンが変わったときに、設定を自動で退避します (直近 5 世代)。更新のあとで調子が悪くなったときや、前の版に戻したときは、ここから戻せます。':
    'Whenever the app version changes, your settings are saved aside automatically (last 5 kept). If something goes wrong after an update — or after going back to an older version — you can restore from here.',
  'まだバックアップはありません。次にバージョンが変わったときに作られます。':
    'No backups yet. One will be made the next time the version changes.',
  '復元': 'Restore', '削除': 'Delete',
  // v5.5 シーン
  'シーン (状況で自動切り替え)': 'Scenes (auto-switch by context)',
  '状況に合わせてレイアウトを自動で切り替える': 'Switch layouts automatically to match what you are doing',
  'ゲームが前面のときはゲーム用、仕事の時間帯は仕事用——のように、上のレイアウトプリセットを状況で切り替えます。ルールは上から順に評価され、最初に当てはまったものが使われます。シーンが切り替える直前、未保存の配置は「シーン切替前 (自動)」レイアウトに退避されるので、作業が消えることはありません。':
    'Game layout while a game is focused, work layout during work hours - scenes switch between the layout presets above based on context. Rules are checked top to bottom and the first match wins. Right before a scene switches, any unsaved arrangement is saved aside as the "Before scene switch (auto)" layout, so nothing is ever lost.',
  '通常時 (どれにも当てはまらないとき)': 'Normally (when nothing matches)',
  '壁紙だけ切り替える (ウィジェットはそのまま)': 'Switch only the wallpaper (leave widgets alone)',
  '切り替わるのは背景だけです。ウィジェットは置いたまま残ります。':
    'Only the background changes. Your widgets stay where they are.',
  'レイアウトごと入れ替えます。そのレイアウトを保存したあとに足したウィジェットは、切り替えた瞬間に画面から消えます (設定には残ります)。':
    'The whole layout is swapped in. Widgets added after that layout was saved disappear from the screen the moment it switches (they remain in your settings).',
  'ルールを追加': 'Add rule',
  'アプリが前面のとき': 'When an app is in front',
  'フルスクリーン中': 'While fullscreen',
  '時間帯': 'Time of day',
  'バッテリー駆動中': 'On battery power',
  '(レイアウトを選ぶ)': '(choose a layout)',
  'ルール名 (例: ゲーム中)': 'Rule name (e.g. Gaming)',
  '優先度を上げる (上のルールが勝ちます)': 'Raise priority (upper rules win)',
  '前面のアプリを取得': 'Grab the app in front',
  '対象のアプリをクリックしてください…': 'Click the target app window...',
  'アプリを取得できませんでした (ボタンを押してから 6 秒以内に対象のウィンドウをクリックしてください)':
    'Could not detect the app (click the target window within 6 seconds of pressing the button)',
  '→ このレイアウトへ': 'switch to this layout:',
  '→ アイコンは': 'and desktop icons:', '(アイコンは触らない)': "(don't touch icons)",
  // v5.9 切り替えボタン
  '切り替えボタン': 'Switcher',
  '呼び名': 'Label', ' (空欄なら種類名)': ' (blank = type name)',
  'いまは隠しています。押すと出します': 'Hidden. Click to show',
  '押すと隠します (設定は残ります)': 'Click to hide (settings are kept)',
  '切り替えるもの': 'Switches', 'レイアウト': 'Layout', 'アイコンのモード': 'Icon mode',
  '並べるモード': 'Modes to show',
  '並べるレイアウト': 'Layouts to show',
  '空欄 = 保存済みすべて / 例: 通常, 仕事用, ゲーム用': 'Blank = all saved / e.g. Normal, Work, Gaming',
  '並び': 'Direction', '縦に並べる': 'Stack vertically',
  'デスクトップ上のボタンでレイアウトを切り替えられます。いま当たっているレイアウトのボタンが光ります。シーンが「状況で自動」なら、こちらは「手で今すぐ」です。':
    'Switch layouts from a button bar on the desktop. The active layout lights up. Where scenes switch automatically by context, this switches on demand.',
  '先にレイアウトを保存してください': 'Save a layout preset first',
  // v5.7 デスクトップアイコン
  'デスクトップアイコンの配置': 'Desktop icon layout',
  'アイコンの並びを保存しておき、解像度の変更やモニタの抜き差しで散らかったときに元へ戻せます。保存は読み取るだけで、配置を変更するのは「復元」を押したときだけ。復元の直前には今の並びを「復元前 (自動)」として退避するので、戻しすぎても元に戻せます。':
    'Save your icon arrangement and put it back when a resolution change or unplugged monitor scatters it. Saving only reads; the arrangement changes only when you press Restore. Right before a restore the current arrangement is stashed as "Before restore (auto)", so you can undo an unwanted restore too.',
  '今の配置を保存': 'Save current arrangement',
  '解像度が変わったら自動で戻す': 'Restore automatically when resolution changes',
  '既定はオフです。オンにすると、モニタ構成が変わったときに選んだ配置へ自動で戻します (このときも直前に自動退避します)。':
    'Off by default. When on, the chosen arrangement is restored automatically whenever the monitor setup changes (this too stashes a backup first).',
  '現在のアイコン: ': 'Current icons: ',
  ' 個': '',
  'デスクトップアイコンにアクセスできません': 'Cannot access desktop icons',
  '保存しました (': 'Saved (',
  '復元しました (': 'Restored (',
  ' / 見つからず飛ばした: ': ' / skipped (not found): ',
  '(なし = オフ)': '(none = off)',
  'この配置で隠すアイコン': 'Icons to hide in this arrangement',
  'クリックで隠す': 'Click to hide', 'クリックで表示に戻す': 'Click to show again',
  '画面のすき間へ最大 ': 'Up to ', ' 個まで隠せます。隠したアイコンは削除されません。': ' icons can be tucked into the gap between monitors. Hidden icons are never deleted.',
  'この画面構成では隠す場所がありません (モニタが画面いっぱいのため)。フォルダウィジェットで必要なものだけ並べる方法をおすすめします。':
    'There is no off-screen gap on this display setup, so icons cannot be hidden. A folder widget listing just what you need works well instead.',
  '隠す ': 'hidden ', ' / 隠した: ': ' / hidden: ',
  '直前の状態を自動で控えてあります': 'A copy of the previous state is kept automatically',
  '元に戻す': 'Undo', 'いま行った復元や切り替えを取り消します': 'Undo the restore or switch you just made',
  '元に戻しました': 'Reverted',
  'デスクトップアイコン': 'Desktop icons',
  'アイコンの配置を保存する': 'Save an icon arrangement',
  '画面の外にあるアイコン': 'Icons currently off-screen',
  'すべて表示する': 'Bring them all back',
  '隠したアイコンが分からなくなったときは、これを押せば全部を画面に呼び戻します。保存した配置が無くても戻せます。':
    'If you lose track of hidden icons, this pulls every one of them back onto the screen. It works even with no saved arrangement.',
  'ありません': 'None',
  'モードごとに、どのアイコンを隠すかをチェックで決めます。モード名をクリックすると開きます。':
    'Decide which icons each mode hides by ticking them. Click a mode name to open it.',
  '新しいモードを作る': 'Create a new mode', '今の配置で作成': 'Create from current layout',
  'まだモードがありません。下で名前を付けて作成してください。': 'No modes yet. Name one below to create it.',
  '見えるのは ': 'visible ', 'すべて表示': 'Show all', 'すべて隠す': 'Hide all',
  'この内容で保存': 'Save this mode', 'このモードを適用': 'Apply this mode',
  '保存しました': 'Saved', '適用しました': 'Applied', '隠した: ': 'hidden: ',
  '今の並びを覚え直す': 'Re-capture positions', '今の並びを覚えました (': 'Positions captured (',
  'その名前のモードは既にあります。開いて「今の並びを覚え直す」を使ってください。':
    'A mode with that name already exists. Open it and use "Re-capture positions" instead.',
  'このモードを削除します: ': 'Delete this mode: ',
  'ひとつも選んでいません': 'nothing selected',
  'ひとつも選んでいないので、このモードが効いている間はウィジェットが全部隠れます。':
    'Nothing is selected, so every widget is hidden while this mode is active.',
  'しまってあるウィジェット: ': 'Parked widgets: ',
  'ここへドラッグでも追加できます (複数まとめて OK)': 'Or drag files here (multiple at once is fine)',
  '{n} 個を追加しました': 'Added {n} item(s)',
  'ファイルのパスを取得できませんでした': 'Could not resolve the dropped file paths',
  'リンク': 'Link', 'リンクを追加': 'Add link', 'リンクを追加しました': 'Link added',
  '名前 (省略可)': 'Name (optional)', 'URL が正しくありません': 'That URL looks wrong',
  'もう入っています': 'Already in the list',
  '並べ方': 'Layout', '格子': 'Grid', '円形': 'Circle',
  '反応する出力': 'React to outputs',
  'チェックした出力が既定のときだけ動きます。何も選ばなければ、どの出力でも動きます。':
    'Runs only while a checked output is the default device. Leave all unchecked to react to any output.',
  '出力デバイスを取得できませんでした': 'Could not list audio outputs', ' (いまの既定)': ' (current default)',
  '名前を付ける': 'Name this widget', '絞り込み': 'Filter', '名前や種類で探す': 'Search by name or type',
  '見つかりませんでした': 'Nothing matched', 'いま適用中': 'active now', '読み直しました': 'Reloaded',
  'しまってあった ': 'restored ', ' 個を出しました': ' parked widgets',
  '画面に無い保存位置だった {n} 個は前の場所へ': '{n} kept their previous on-screen spot',
  '行き先の分からない {n} 個は空きへ': '{n} placed in empty cells',
  '作成できませんでした: ': 'Could not create: ', '保存できませんでした: ': 'Could not save: ',
  'いま適用中は「': 'The active mode is "', '」です。「': '". Overwrite "',
  '」の並びを、今のデスクトップの並びで上書きします。よろしいですか?':
    '" with the current desktop arrangement?', '並び替えを保存できませんでした': 'Could not save the order',
  'デスクトップの「アイコンの自動整列」がオンになっています。オンの間は、隠したり位置を戻したりしても Windows がすぐ並べ直してしまいます。デスクトップを右クリック → 表示 → 「アイコンの自動整列」をオフにしてください。':
    'Windows "Auto arrange icons" is ON, so anything this page does gets rearranged immediately. Right-click the desktop → View → turn off "Auto arrange icons".',
  'モード切替ボタン': 'Mode switch button',
  'モード': 'Modes', '内部エラー: ': 'Internal error: ', '重ね': 'Overlay', '効いています': 'active', 'このモードの動作': 'This mode',
  '「{a}」をオンにしたので「{b}」をオフにしました': 'Turned off "{b}" because "{a}" was turned on',
  'シーンとレイアウトプリセットは「アイコン」のモードに統合されました。壁紙・ウィジェットの表示・アイコンをモードごとに覚えて、手動または条件 (アプリが前面など) で切り替えられます。これまでのプリセットとルールは自動でモードに変換済みです。':
    'Scenes and layout presets have been merged into Modes on the Icons page. A mode remembers the wallpaper, which widgets are shown, and the icon arrangement, switched manually or by a condition. Your existing presets and rules were converted automatically.',
  'オフ': 'Off', '常に効かせる': 'Always on',
  '条件: アプリが前面のとき': 'When an app is in front', '条件: 全画面のアプリがあるとき': 'When an app is fullscreen',
  '条件: バッテリー駆動のとき': 'When on battery', '条件: 時間帯': 'During a time of day',
  'いまモード「{n}」が効いていて、その壁紙が上に重なっています。ここで変えた内容は土台に保存され、モードが外れたときに表示されます。':
    'Mode "{n}" is active and its wallpaper is layered on top. Changes made here are saved to the base and appear when the mode turns off.',
  '壁紙を覚えています': 'remembers a wallpaper', '壁紙は覚えていません': 'no wallpaper remembered',
  'このモードを今すぐ効かせる': 'Turn this mode on now', '壁紙も覚える': 'Remember the wallpaper too',
  'いまの壁紙を覚えました': 'Current wallpaper remembered', '壁紙を忘れました': 'Wallpaper forgotten',
  '自動で効く条件': 'Turn on automatically when', 'なし (手動だけ)': 'Never (manual only)',
  'アプリが前面': 'An app is in front', '全画面のアプリがある': 'An app is fullscreen',
  'バッテリー駆動': 'On battery', '時間帯': 'Time of day', 'アプリ名': 'App name',
  '前面のアプリの実行ファイル名です。タスクマネージャーの「詳細」タブで確認できます。':
    'The executable name of the foreground app. You can find it on the Details tab of Task Manager.',
  '効いている間だけ、覚えたものが上に重なります。条件から外れると自動で元へ戻ります。設定そのものは書き換わりません。':
    'While a mode is on, what it remembers is layered on top. When the condition stops matching it peels off by itself. Your own settings are never overwritten.',
  'モードの名前': 'Mode name', '名前を変える': 'Rename', '名前を変えました': 'Renamed',
  'デスクトップのアイコン': 'Desktop icons', 'ウィジェット': 'Widgets', 'ウィジェット ': 'widgets ',
  'このモードでウィジェットも切り替える': 'Switch widgets with this mode too',
  '連動しません': 'not linked', '出す ': 'shown ',
  'すべて出す': 'Show all', 'すべてしまう': 'Hide all',
  'ウィジェットがまだありません。': 'No widgets yet.',
  '切り替えボタンをしまうと、そのモードからは押せなくなります (設定画面からは戻せます)。':
    'Hiding the switcher means you cannot press it in that mode (you can still switch back from settings).',
  '呼び名を付ける (デスクトップの名前は変わりません)': 'Give it a label (your desktop is not renamed)',
  'モニタ': 'Monitor', '未接続のモニタ': 'Disconnected monitor',
  '未接続のモニタ (つないだら戻ります)': 'Disconnected monitor (returns when reconnected)',
  'モード一覧を表示できませんでした: ': 'Could not show the mode list: ',
  '作成しました。開いて隠すアイコンを選んでください。': 'Created. Open it and tick the icons to hide.',
  '全部で ': 'Total ',
  '確認できませんでした': 'Could not check',
  'いま確認できませんでした。公開の直後かもしれません。少し待ってからもう一度お試しください。':
    'Could not check just now. The release may still be going up — please try again in a moment.',
  '元の位置に戻す': 'Put them back', '元の位置に戻しました (': 'Put back (',
  ' / 元の位置が分からず並べ直した: ': ' / no known spot, laid out: ',
  '隠したアイコンが分からなくなったときは、これを押せば元の位置へ戻します。隠す前の位置を覚えているので、保存した配置が無くても戻せます。元の位置が今の画面に無いものだけ、空いている場所へ並べます。':
    'If you lose track of hidden icons, this puts them back where they were. Their pre-hide positions are remembered, so it works with no saved arrangement. Only icons whose old spot no longer exists get laid out in free space.',
  'シーン': 'Scenes', 'アイコン': 'Icons', '設定': 'Settings',
  '赤くなっているキーは、他のアプリがすでに使っているため登録できませんでした。別のキーに変えてください。':
    'The keys marked in red could not be registered because another app already uses them. Please choose different keys.',
  // v5.3 呼び出せるダッシュボード
  '呼び出せるダッシュボード': 'Summonable dashboard',
  'ダッシュボードを呼び出す': 'Summon the dashboard',
  'ホットキーを押すと、いまの配置がそのまま最前面に浮かび上がります。作業中でウィンドウに隠れていても、ひと目で確認できます。もう一度押すか Esc、または余白のクリックで閉じます。':
    'Press the hotkey and your current layout rises to the front, exactly as arranged. You can check it at a glance even while windows cover the desktop. Press again, hit Esc, or click empty space to dismiss.',
  '背景の暗さ': 'Backdrop dimming',
  '表示中はデスクトップアイコンを隠す': 'Hide desktop icons while shown',
  'すべてのモニタに出す': 'Show on every monitor',
  'OFF のときは、マウスカーソルのあるモニタにだけ表示します。': 'When off, it appears only on the monitor under the pointer.',
  '他をクリックしたら閉じる': 'Dismiss when it loses focus',
  '先行版': 'Prerelease', 'があります': 'is available',
  '開発版のため不具合が残っている場合があります': 'a development build, bugs may remain',
  '先行版を受け取る': 'Receive prereleases',
  '先行版を入れる': 'Install prerelease',
  '新機能を試せる開発版 (5.3 / 5.5 のようにマイナーが奇数の版) を受け取ります。不具合が残っている可能性があるため、入れる前に必ず確認します。OFF のままなら安定版だけが届きます。':
    'Receive development builds with new features (odd minor versions such as 5.3 or 5.5). They may still contain bugs, so you are always asked before one is installed. Leave this off to receive stable releases only.',
  'テーマ': 'Themes', '壁紙': 'Wallpaper', 'ウィジェット': 'Widgets', '一般': 'General',
  'レイアウトを編集': 'Edit layout',
  'プリセット': 'Presets', 'カスタム': 'Custom', '画像・動画': 'Image / Video', '効果': 'Effects',
  'タイプ': 'Type', 'グラデーション': 'Gradient', '放射': 'Radial', '単色': 'Solid',
  '角度': 'Angle', '色 (最大 10 色)': 'Colors (max 10)', 'パレットに保存': 'Save to palette', '壁紙に適用': 'Apply',
  'ファイル': 'File', '未選択': 'Not set', '未設定': 'Not set', '選択…': 'Choose…',
  'スライドショー': 'Slideshow', 'シャッフル': 'Shuffle', 'フォルダから…': 'From folder…', '画像を複数選択…': 'Pick images…',
  '暗くする': 'Darken', '明るくする': 'Brighten', 'ぼかし': 'Blur',
  'ゆっくり動かす': 'Slow motion', 'マウスに合わせて視差': 'Mouse parallax',
  '追加': 'Add', '配置済み': 'Placed widgets',
  'モニタ': 'Monitor', 'フォント': 'Font', '太さ': 'Weight', 'サイズ': 'Size', '字間': 'Spacing',
  '色': 'Color', '影': 'Shadow', '不透明度': 'Opacity', '位置': 'Position', '位置をロック': 'Lock position',
  'ソフト': 'Soft', 'ネオン': 'Neon', 'なし': 'None',
  '直径': 'Diameter', '針の色': 'Hands color',
  '秒を表示': 'Show seconds', '12時間表示': '12-hour', 'AM / PM を表示': 'Show AM/PM',
  '表示形式': 'Format', '検索': 'Search',
  '天気アイコン': 'Icon', '都市名': 'City name', '天気の説明': 'Description', '最高 / 最低気温': 'High / Low',
  '秒針': 'Second hand', '目盛り': 'Ticks', '文字盤': 'Face', 'ダーク': 'Dark', 'ライト': 'Light', '文字盤の濃さ': 'Face opacity',
  '曜日の行': 'Weekday row', '日曜・土曜に色': 'Color Sun/Sat', '背景パネル': 'Background panel', '今日の色': 'Today color', '背景の濃さ': 'Background opacity',
  'タイトル': 'Title', '日付': 'Date', '過ぎたら経過日数を表示': 'Show days passed',
  'フィード URL': 'Feed URL', '表示件数': 'Items', '見出しの切替': 'Rotation',
  '銘柄 (カンマ区切り)': 'Symbols (comma separated)', '前日比を表示': 'Show daily change',
  'アルバムアート': 'Album art', 'アーティスト名': 'Artist', '再生ボタン': 'Playback buttons', '停止中は隠す': 'Hide when stopped',
  '幅': 'Width', '高さ': 'Height', '幅 (画面比)': 'Width (% of screen)', '角丸': 'Corner radius',
  'データソース': 'Data source', '温度を表示': 'Show temps', '1行にまとめる': 'Compact', 'グラフを表示': 'Show graph',
  '温度アラート': 'Temp alert', 'メモリ': 'Memory', 'ストレージ (SSD)': 'Storage (SSD)', 'ネットワーク': 'Network',
  '出力デバイスの切替を表示': 'Show output device switcher',
  '表示': 'View', '週間': 'Weekly', '時間別': 'Hourly', '件数': 'Count', '天気アイコン': 'Weather icons',
  'カレンダー URL': 'Calendar URL', '表示する予定数': 'Events to show', '先の期間': 'Look ahead',
  '今日のみ': 'Today only', '3日先まで': 'Next 3 days', '1週間先まで': 'Next 7 days', '2週間先まで': 'Next 14 days', '時刻を表示': 'Show time',
  '日付も表示': 'Show date', '残量バーを表示': 'Show level bar', '残量アラート': 'Low battery alert',
  '対象ドライブ': 'Drives', '使用量バーを表示': 'Show usage bar',
  'ローカル IP': 'Local IP', 'Wi-Fi 名 (SSID)': 'Wi-Fi (SSID)', '遅延 (PING)': 'Latency (PING)', '遅延グラフ': 'Latency graph',
  'バーの本数': 'Bars', '中央から上下対称': 'Mirror from center',
  'ラベル': 'Label', 'ラベル位置': 'Label position', '枠線': 'Border', '塗りつぶし': 'Fill',
  '左上': 'Top left', '中央上': 'Top center', '右上': 'Top right', '左下': 'Bottom left', '枠の外 (上)': 'Outside (top)',
  '向き': 'Orientation', '横': 'Horizontal', '縦': 'Vertical', '長さ': 'Length', 'スタイル': 'Style',
  '実線': 'Solid', '破線': 'Dashed', '点線': 'Dotted',
  'アイテム': 'Items', '列数': 'Columns', '自動': 'Auto', 'アイコンサイズ': 'Icon size', '名前を表示': 'Show labels',
  '時計 (デジタル)': 'Clock (digital)', '時計 (アナログ)': 'Clock (analog)', 'カレンダー': 'Calendar', '天気': 'Weather',
  'テキスト': 'Text', '画像': 'Image', 'ハードウェアモニタ': 'Hardware monitor', '再生中の曲': 'Now playing',
  '音量・出力切替': 'Volume & output', 'カウントダウン': 'Countdown', 'ニュース (RSS)': 'News (RSS)', '株価・為替': 'Stocks & FX',
  'メモ (書き込める付箋)': 'Sticky note', 'ToDo リスト': 'To-do list', 'ポモドーロタイマー': 'Pomodoro timer',
  '天気予報 (時間別・週間)': 'Forecast (hourly / weekly)', '予定表 (カレンダー購読)': 'Agenda (ICS)', '世界時計': 'World clock',
  'バッテリー': 'Battery', 'ディスク空き容量': 'Disk space', 'ネットワーク情報': 'Network info', 'ビジュアライザー': 'Visualizer',
  'ゾーン (色分け枠)': 'Zone (colored frame)', 'ライン (線)': 'Line', 'フォルダ (アプリまとめ)': 'Folder (app launcher)',
  'デスクトップ': 'Desktop', 'デスクトップアイコンを表示': 'Show desktop icons', '言語 / Language': 'Language',
  '自動 (OS に合わせる)': 'Auto (match OS)',
  'ホットキー': 'Hotkeys', 'グローバルホットキーを有効にする': 'Enable global hotkeys',
  'ウィジェットの表示切替': 'Toggle widgets', 'アイコンの表示切替': 'Toggle desktop icons',
  'レイアウト切替 (次へ)': 'Next layout', 'ポモドーロ開始 / 停止': 'Start / stop pomodoro',
  '起動と電力': 'Startup & power', 'Windows 起動時に自動で開始': 'Start with Windows',
  '壁紙スケジュール': 'Wallpaper schedule', '壁紙を自動で切り替える': 'Auto-switch wallpaper',
  '昼 / 夜': 'Day / Night', '曜日ごと': 'By weekday', '昼の開始': 'Day starts', '夜の開始': 'Night starts',
  '今の壁紙を昼用に登録': 'Save current as day', '今の壁紙を夜用に登録': 'Save current as night',
  '曜日ごとの壁紙': 'Weekday wallpapers', '今の壁紙を登録': 'Save current', 'クリア': 'Clear',
  'レイアウトプリセット': 'Layout presets', '現在の構成を保存': 'Save current setup', '保存': 'Save',
  '適用': 'Apply', '上書き': 'Overwrite',
  '更新間隔': 'Update interval', '今すぐ更新': 'Update now',
  'フォントを追加': 'Add font',
  'バックアップ': 'Backup', '設定のエクスポート / インポート': 'Export / import settings',
  'エクスポート': 'Export', 'インポート': 'Import',
  'アップデートとメンテナンス': 'Updates & maintenance', 'アップデート': 'Updates', '確認': 'Check',
  '再起動して更新': 'Restart & update', '表示がおかしいとき': 'Display problems', '壁紙を再適用 (修復)': 'Re-apply wallpaper (repair)',
  'アプリ': 'App', 'バージョン': 'Version', '完全終了': 'Quit', 'アンインストール': 'Uninstall', 'アンインストール…': 'Uninstall…',
  '1分': '1 min', '5分': '5 min', '10分': '10 min', '15分': '15 min', '30分': '30 min', '60分': '60 min',
  '3件': '3', '5件': '5', '8件': '8', '12件': '12', '1件': '1', '2件': '2',
  'なし (リスト表示)': 'Off (list)', '10秒ごとに1件': 'Every 10s', '30秒ごとに1件': 'Every 30s', '60秒ごとに1件': 'Every 60s',
  '自動 (LHM があれば使う)': 'Auto (use LHM if running)', '内蔵 (CPU/MEM のみ)': 'Built-in (CPU/MEM only)',

  'まずは好みのテーマをひとつ選んでください。あとから何でも変えられます。': 'Pick a theme to start with. You can change everything later.',
  '自分でゼロから作る': 'Start from scratch',
  'ミニマル': 'Minimal', 'サイバー': 'Cyber', '和': 'Zen', '情報ダッシュボード': 'Dashboard', 'フォーカス': 'Focus', 'ミュージック': 'Music',
};

let osLocale = 'ja';

function uiLang() {
  const l = (cfg && cfg.settings && cfg.settings.language) || 'auto';
  if (l !== 'auto') return l;
  return (osLocale || 'ja').toLowerCase().startsWith('ja') ? 'ja' : 'en';
}

function T(s) {
  if (uiLang() !== 'en') return s;
  return JA_EN[s] || s;
}

// アプリ名は package.json 由来の 1 か所から流し込む (改名しても追従する)
let BRAND = 'AeroWidget';
function applyBrand() {
  for (const el of document.querySelectorAll('[data-brand]')) el.textContent = BRAND;
  for (const el of document.querySelectorAll('[data-brand-welcome]')) {
    el.textContent = uiLang() === 'en' ? `Welcome to ${BRAND}` : `ようこそ ${BRAND} へ`;
  }
}

// data-i18n の付いた静的 HTML を言語に合わせて差し替える
function applyI18n() {
  applyBrand();
  for (const el of document.querySelectorAll('[data-i18n]')) {
    if (el.dataset.i18nJa == null) el.dataset.i18nJa = el.textContent;
    el.textContent = uiLang() === 'en' ? (JA_EN[el.dataset.i18nJa] || el.dataset.i18nJa) : el.dataset.i18nJa;
  }
}

let cfg = null;
let sysWall = '';
let displays = [];
let wpTarget = null;          // null = すべて共通, number = モニタ index
let lhmOnline = false;
let systemFonts = [];
let suppressUntil = 0;
const expanded = new Set();
const debTimers = new Map();

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function svgIcon(id, cls = 'ic') {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('class', cls);
  const use = document.createElementNS(ns, 'use');
  use.setAttribute('href', '#' + id);
  svg.appendChild(use);
  return svg;
}

function touch() { suppressUntil = Date.now() + 1500; }

// ---- 安全網 ----
// 巨大な 1 ファイルの宿命として、どこか 1 か所の例外が後続の配線を全部殺す。
// 例外は必ず画面に出す (無反応に見せない)。多発時は 1 回だけ知らせる
let lastErrToast = 0;
function reportError(kind, err) {
  const msg = (err && (err.message || err.reason && err.reason.message)) || String(err);
  console.error('[settings]', kind, err);
  if (Date.now() - lastErrToast > 4000 && typeof toast === 'function') {
    lastErrToast = Date.now();
    try { toast(T('内部エラー: ') + String(msg).slice(0, 80)); } catch (_) {}
  }
}
window.addEventListener('error', (e) => reportError('error', e.error || e));
window.addEventListener('unhandledrejection', (e) => reportError('rejection', e.reason || e));

// 描画関数を「転んでも他を巻き込まない」形で、終わるまで待って呼ぶ
async function safeRenderAsync(name, fn) {
  try { await fn(); } catch (err) { reportError(name, err); }
}

// 描画関数を「転んでも他を巻き込まない」形で呼ぶ
function safeRender(name, fn) {
  try {
    const r = fn();
    if (r && typeof r.catch === 'function') r.catch(err => reportError(name, err));
  } catch (err) {
    reportError(name, err);
  }
}

// 設定画面が編集するのは常に「土台」。モードの重ねが乗った結果ではない
async function baseConfig() {
  const env = await window.api.getConfig();
  return env.base || env.config;
}

function debounced(key, ms, fn) {
  clearTimeout(debTimers.get(key));
  debTimers.set(key, setTimeout(fn, ms));
}

function clone(v) { return JSON.parse(JSON.stringify(v)); }

function patchWidget(id, patch, opts = {}) {
  touch();
  const w = cfg.widgets.find(x => x.id === id);
  if (w) {
    const { options, ...rest } = patch;
    Object.assign(w, rest);
    if (options) Object.assign(w.options, options);
  }
  if (opts.debounce) {
    debounced('w:' + id + ':' + Object.keys(patch).join(','), 140, () => window.api.updateWidget(id, patch));
  } else {
    window.api.updateWidget(id, patch);
  }
}

function customCss(v) {
  const colors = (v && v.colors && v.colors.length) ? v.colors : ['#223', '#112'];
  if (v.kind === 'solid' || colors.length === 1) return colors[0];
  if (v.kind === 'radial') return `radial-gradient(120% 120% at 25% 20%, ${colors.join(', ')})`;
  return `linear-gradient(${v.angle ?? 135}deg, ${colors.join(', ')})`;
}

// 壁紙設定オブジェクト → プレビュー用 CSS
function wpCss(wp) {
  if (!wp) return '';
  if (wp.type === 'preset') return (PRESETS[wp.value] || PRESETS.aurora).css;
  if (wp.type === 'custom') return customCss(wp.value || {});
  if (wp.type === 'color') return wp.value;
  if (wp.type === 'nowplaying') return PRESETS.midnight.css;
  return 'linear-gradient(155deg, #202329, #16181c)';
}

// ---------------------------------------------------------------- ミニプレビュー
// 壁紙 + ウィジェット構成の簡易描画。テーマカードと壁紙タブのライブプレビューで共用。
function fmtNow(o = {}) {
  const d = new Date();
  let h = d.getHours();
  if (o.hour12) h = h % 12 || 12;
  const t = String(h).padStart(o.hour12 ? 1 : 2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  return o.showSeconds ? t + ':' + String(d.getSeconds()).padStart(2, '0') : t;
}

function pvText(w) {
  const o = w.options || {};
  const d = new Date();
  switch (w.type) {
    case 'clock': return fmtNow(o);
    case 'date': return `${d.getMonth() + 1}月${d.getDate()}日`;
    case 'weather': return '☀ 24°';
    case 'forecast': return o.mode === 'hourly' ? '15時 ☀ 24°' : '水 ☀ 28/21\n木 ☂ 24/20';
    case 'text': return (o.text || 'テキスト').split('\n')[0].slice(0, 14);
    case 'stats': return 'CPU 12%  48°C\nMEM 41%';
    case 'ticker': return 'AAPL  230 ▲1.2%';
    case 'rss': return '・ニュースの見出し';
    case 'countdown': return 'あと 42 日';
    case 'worldclock': return 'NYC  09:41';
    case 'battery': return '🔋 84%';
    case 'disk': return 'C: ▮▮▮▯ 213GB';
    case 'netinfo': return 'PING 12ms';
    case 'ics': return '10:00 ミーティング';
    default: return '';
  }
}

function renderMiniPreview(el, wallpapers, widgets, displayIndex = 0) {
  el.classList.add('mini-preview');
  const wp = (wallpapers.byDisplay || {})[String(displayIndex)] || wallpapers.default;
  el.style.background = wpCss(wp);
  el.innerHTML = '';
  const W = el.clientWidth || 320;
  const scale = W / 2560; // 16:9 モニタ換算の簡易スケール
  for (const w of (widgets || [])) {
    if ((w.display || 0) !== displayIndex) continue;
    const o = w.options || {};
    const d = document.createElement('div');
    d.className = 'pv-w';
    d.style.left = w.x + '%';
    d.style.top = w.y + '%';
    if (['note', 'pomo', 'volume', 'nowplaying', 'todo', 'folder', 'switcher', 'modeswitch'].includes(w.type)) {
      d.classList.add('pv-card');
      const cw = (o.w || 240) * scale;
      const chh = (o.h || 170) * scale;
      d.style.width = Math.max(14, cw) + 'px';
      d.style.height = Math.max(9, chh) + 'px';
      d.style.borderRadius = Math.max(2, 14 * scale * 2) + 'px';
      d.style.fontSize = Math.max(4, 30 * scale) + 'px';
      d.textContent = { note: 'メモ', pomo: '25:00', volume: '♪—', nowplaying: '♪', todo: '✓', folder: '▦' }[w.type] || '';
    } else if (w.type === 'analog') {
      d.classList.add('pv-ring');
      const s = (w.size || 200) * scale;
      d.style.width = s + 'px';
      d.style.height = s + 'px';
      d.style.borderColor = hexA7(w.color, 0.8);
    } else if (w.type === 'calendar') {
      d.style.fontSize = Math.max(3.5, (w.size || 15) * scale * 1.6) + 'px';
      d.style.color = w.color || '#fff';
      d.textContent = `8月\n日 月 火 水\n 1  2  3  4`;
    } else if (w.type === 'zone') {
      d.style.width = (o.w || 20) + '%';
      d.style.height = (o.h || 25) + '%';
      d.style.border = `1px dashed ${hexA7(o.borderColor || '#7db4ff', 0.7)}`;
      d.style.borderRadius = '4px';
    } else if (w.type === 'line') {
      if (o.orient === 'v') {
        d.style.height = (o.len || 25) + '%';
        d.style.borderLeft = `1px solid ${hexA7(w.color, 0.7)}`;
      } else {
        d.style.width = (o.len || 25) + '%';
        d.style.borderTop = `1px solid ${hexA7(w.color, 0.7)}`;
      }
    } else if (w.type === 'visualizer') {
      d.style.width = (o.wPct || 40) + '%';
      d.style.height = Math.max(5, (o.hPx || 90) * scale) + 'px';
      d.style.background = `repeating-linear-gradient(90deg, ${hexA7(w.color, 0.75)} 0 2px, transparent 2px 5px)`;
    } else if (w.type === 'image') {
      d.classList.add('pv-card');
      d.style.width = (o.w || 18) + '%';
      d.style.aspectRatio = '4 / 3';
      d.textContent = '🖼';
      d.style.fontSize = Math.max(5, 60 * scale) + 'px';
    } else {
      d.textContent = pvText(w);
      d.style.color = w.color || '#fff';
      d.style.fontWeight = w.weight || 400;
      d.style.fontSize = Math.max(3.5, (w.size || 24) * scale) + 'px';
      d.style.fontFamily = `"${w.font}", "Segoe UI", sans-serif`;
      d.style.letterSpacing = (w.letterSpacing || 0) * scale + 'px';
      if (w.shadow === 'glow') d.style.textShadow = `0 0 ${8 * scale * 10}px ${hexA7(w.color, 0.8)}`;
      if (w.opacity != null) d.style.opacity = w.opacity;
    }
    el.appendChild(d);
  }
}

function hexA7(hex, a) {
  const m = /^#?([0-9a-f]{6})/i.exec(hex || '#ffffff');
  const n = parseInt(m ? m[1] : 'ffffff', 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

function renderLivePreview() {
  const el = $('#live-preview');
  if (!el || !cfg) return;
  renderMiniPreview(el, cfg.wallpapers, cfg.widgets, wpTarget == null ? 0 : wpTarget);
}

// ---------------------------------------------------------------- タブ / タイトルバー
$$('.nav-item').forEach(btn => btn.addEventListener('click', () => {
  $$('.nav-item').forEach(b => b.classList.toggle('active', b === btn));
  $$('.tab').forEach(t => t.classList.toggle('active', t.id === 'tab-' + btn.dataset.tab));
  if (btn.dataset.tab === 'themes') safeRender('themes', () => renderThemes());
  if (btn.dataset.tab === 'wallpaper') safeRender('preview', () => renderLivePreview());
  // 開くたびに実際のデスクトップを読み直す (取り残しの検出を最新に)
  if (btn.dataset.tab === 'icons') safeRender('icons', () => renderIconLayouts());
}));

$('#btn-min').addEventListener('click', () => window.api.minimize());
$('#btn-close').addEventListener('click', () => window.api.close());
$('#btn-edit-layout').addEventListener('click', () => window.api.enterEditMode());
$('#btn-quit').addEventListener('click', () => window.api.quitApp());

// ---------------------------------------------------------------- 壁紙タブ
function curWp() {
  if (wpTarget == null) return cfg.wallpapers.default;
  return cfg.wallpapers.byDisplay[String(wpTarget)] || cfg.wallpapers.default;
}

function setWp(patch) {
  touch();
  if (wpTarget == null) {
    Object.assign(cfg.wallpapers.default, patch);
  } else {
    const k = String(wpTarget);
    cfg.wallpapers.byDisplay[k] = Object.assign({}, cfg.wallpapers.default, cfg.wallpapers.byDisplay[k] || {}, patch);
  }
  window.api.setWallpaper(patch, wpTarget);
  renderWallpaperTab();
}

function renderTargetChips() {
  const row = $('#wp-target-row');
  if (displays.length <= 1) { row.style.display = 'none'; return; }
  row.style.display = 'flex';
  const box = $('#wp-target-chips');
  box.innerHTML = '';
  const mkChip = (label, target, hasOverride) => {
    const chip = document.createElement('button');
    chip.className = 'chip' + ((wpTarget === target) ? ' active' : '');
    chip.textContent = label;
    if (hasOverride) {
      const x = document.createElement('span');
      x.className = 'clear-ov';
      x.textContent = '✕';
      x.title = 'このモニタの個別設定を解除';
      x.addEventListener('click', (e) => {
        e.stopPropagation();
        touch();
        delete cfg.wallpapers.byDisplay[String(target)];
        window.api.clearWallpaperOverride(target);
        renderWallpaperTab();
      });
      chip.appendChild(x);
    }
    chip.addEventListener('click', () => { wpTarget = target; renderWallpaperTab(); });
    box.appendChild(chip);
  };
  mkChip('すべて共通', null, false);
  for (const d of displays) {
    mkChip(d.label, d.index, !!cfg.wallpapers.byDisplay[String(d.index)]);
  }
}

function presetCard(inner, selected, name, onClick) {
  const card = document.createElement('div');
  card.className = 'preset-card' + (selected ? ' selected' : '');
  const swatch = document.createElement('div');
  swatch.className = 'swatch';
  if (typeof inner === 'string') swatch.style.background = inner;
  else if (inner) swatch.appendChild(inner);
  const check = document.createElement('span');
  check.className = 'p-check';
  check.appendChild(svgIcon('i-check'));
  const label = document.createElement('span');
  label.className = 'p-name';
  label.textContent = name;
  card.appendChild(swatch);
  card.appendChild(check);
  card.appendChild(label);
  card.addEventListener('click', onClick);
  return card;
}

function renderPresets() {
  const grid = $('#preset-grid');
  grid.innerHTML = '';
  const wp = curWp();

  // 透過モード: Windows の壁紙のままウィジェットだけ表示
  const sys = presetCard(svgIcon('i-monitor'), wp.type === 'system', '今の壁紙のまま',
    () => setWp({ type: 'system', value: '' }));
  sys.title = 'Windows の壁紙はそのままに、ウィジェットだけ表示します';
  grid.appendChild(sys);

  // 再生中の曲のアルバムアートを壁紙に
  const np = presetCard(svgIcon('i-music'), wp.type === 'nowplaying', 'アルバムアート',
    () => setWp({ type: 'nowplaying', value: '' }));
  np.title = 'Spotify やブラウザで再生中の曲のジャケットを、ぼかして壁紙にします';
  grid.appendChild(np);

  // オンライン壁紙 (キー不要のソースのみ)
  const bing = presetCard(svgIcon('i-globe'), wp.type === 'online' && (wp.value || {}).source !== 'picsum', 'Bing 今日の画像',
    () => setWp({ type: 'online', value: { source: 'bing', refreshHours: 24 } }));
  bing.title = 'Bing の「今日の画像」を毎日自動で取得します';
  grid.appendChild(bing);

  const pic = presetCard(svgIcon('i-spark'), wp.type === 'online' && (wp.value || {}).source === 'picsum', 'ランダム写真',
    () => setWp({ type: 'online', value: { source: 'picsum', refreshHours: 24 } }));
  pic.title = 'Lorem Picsum からランダムな写真を取得します (24時間ごとに更新)';
  grid.appendChild(pic);

  for (const [key, p] of Object.entries(PRESETS)) {
    grid.appendChild(presetCard(p.css, wp.type === 'preset' && wp.value === key, p.label,
      () => setWp({ type: 'preset', value: key })));
  }
}

// ---- カスタムビルダー ----
const cb = { kind: 'linear', angle: 135, colors: ['#e3a94f', '#22262e'] };

function renderCustomBuilder() {
  $$('#cb-kind-seg button').forEach(b => b.classList.toggle('on', b.dataset.v === cb.kind));
  $('#cb-angle-row').style.display = cb.kind === 'linear' ? 'flex' : 'none';
  $('#cb-angle').value = cb.angle;
  $('#cb-angle-val').textContent = cb.angle + '°';
  const row = $('#cb-colors');
  row.innerHTML = '';
  cb.colors.forEach((c, i) => {
    const inp = document.createElement('input');
    inp.type = 'color';
    inp.value = c;
    inp.addEventListener('input', () => { cb.colors[i] = inp.value; renderCbPreview(); });
    row.appendChild(inp);
  });
  renderCbPreview();
  renderSavedPresets();
}

function renderCbPreview() {
  $('#cb-preview').style.background = customCss(cb);
}

function renderSavedPresets() {
  const grid = $('#cb-saved');
  grid.innerHTML = '';
  (cfg.settings.customPresets || []).forEach((v, i) => {
    const card = document.createElement('div');
    card.className = 'saved-card';
    card.style.background = customCss(v);
    card.title = 'クリックで壁紙に適用';
    const del = document.createElement('span');
    del.className = 'del';
    del.textContent = '✕';
    del.addEventListener('click', (e) => {
      e.stopPropagation();
      touch();
      cfg.settings.customPresets.splice(i, 1);
      window.api.removeCustomPreset(i);
      renderSavedPresets();
    });
    card.appendChild(del);
    card.addEventListener('click', () => {
      Object.assign(cb, clone(v));
      renderCustomBuilder();
      setWp({ type: 'custom', value: clone(v) });
    });
    grid.appendChild(card);
  });
}

$$('#cb-kind-seg button').forEach(b => b.addEventListener('click', () => {
  cb.kind = b.dataset.v;
  renderCustomBuilder();
}));
$('#cb-angle').addEventListener('input', (e) => {
  cb.angle = +e.target.value;
  $('#cb-angle-val').textContent = cb.angle + '°';
  renderCbPreview();
});
$('#cb-add-color').addEventListener('click', () => {
  if (cb.colors.length < MAX_CUSTOM_COLORS) {
    const palette = ['#8b5cf6', '#2dd4bf', '#f472b6', '#facc15', '#60a5fa', '#34d399', '#fb923c', '#e879f9'];
    cb.colors.push(palette[cb.colors.length % palette.length]);
    renderCustomBuilder();
  }
});
$('#cb-del-color').addEventListener('click', () => {
  if (cb.colors.length > 1) { cb.colors.pop(); renderCustomBuilder(); }
});
$('#cb-apply').addEventListener('click', () => setWp({ type: 'custom', value: clone(cb) }));
$('#cb-save').addEventListener('click', () => {
  touch();
  const v = clone(cb);
  cfg.settings.customPresets = [v, ...(cfg.settings.customPresets || [])].slice(0, 24);
  window.api.saveCustomPreset(v);
  renderSavedPresets();
});

function renderWallpaperTab() {
  {
    const note = document.getElementById('wp-overlay-note') || (() => {
      const el = document.createElement('p');
      el.id = 'wp-overlay-note';
      el.className = 'foot-note warn';
      const host = document.querySelector('#tab-wallpaper h1');
      if (host) host.after(el);
      return el;
    })();
    if (activeModeNames.length) {
      note.style.display = '';
      note.textContent = T('いまモード「{n}」が効いていて、その壁紙が上に重なっています。ここで変えた内容は土台に保存され、モードが外れたときに表示されます。')
        .replace('{n}', activeModeNames.join('・'));
    } else {
      note.style.display = 'none';
    }
  }
  renderTargetChips();
  renderPresets();
  renderLivePreview();
  const wp = curWp();
  const label = $('#file-label');
  if (wp.type === 'image' || wp.type === 'video') {
    label.textContent = (wp.type === 'video' ? '動画: ' : '画像: ') + wp.value.split(/[\\/]/).pop();
  } else {
    label.textContent = '未選択';
  }
  const ssLabel = $('#slideshow-label');
  if (wp.type === 'slideshow' && wp.value) {
    ssLabel.textContent = wp.value.dir
      ? `フォルダ: ${String(wp.value.dir).split(/[\\/]/).pop()}`
      : `${(wp.value.files || []).length} 枚を再生中`;
    $('#slideshow-interval').value = String(wp.value.intervalMin || 5);
    $('#slideshow-shuffle').checked = !!wp.value.shuffle;
  } else {
    ssLabel.textContent = '未設定';
  }
  if (document.activeElement !== $('#wp-dim')) $('#wp-dim').value = wp.dim;
  if (document.activeElement !== $('#wp-bright')) $('#wp-bright').value = wp.bright || 0;
  if (document.activeElement !== $('#wp-blur')) $('#wp-blur').value = wp.blur;
  $('#wp-dim-val').textContent = wp.dim + '%';
  $('#wp-bright-val').textContent = '+' + (wp.bright || 0) + '%';
  $('#wp-blur-val').textContent = wp.blur + 'px';
  $('#wp-animate').checked = !!wp.animate;
  $('#wp-parallax').checked = !!wp.parallax;
}

$('#btn-pick').addEventListener('click', async () => {
  const r = await window.api.pickFile();
  if (!r) return;
  setWp({ type: r.kind, value: r.path });
});

$('#btn-pick-slideshow').addEventListener('click', async () => {
  const files = await window.api.pickImages();
  if (!files || !files.length) return;
  setWp({
    type: 'slideshow',
    value: { files, intervalMin: +$('#slideshow-interval').value || 5, fade: true, shuffle: $('#slideshow-shuffle').checked },
  });
});

$('#btn-pick-slideshow-dir').addEventListener('click', async () => {
  const dir = await window.api.pickDir();
  if (!dir) return;
  setWp({
    type: 'slideshow',
    value: { dir, intervalMin: +$('#slideshow-interval').value || 5, fade: true, shuffle: $('#slideshow-shuffle').checked },
  });
});

$('#slideshow-interval').addEventListener('change', (e) => {
  const wp = curWp();
  if (wp.type === 'slideshow' && wp.value) {
    setWp({ value: { ...wp.value, intervalMin: +e.target.value || 5 } });
  }
});

$('#slideshow-shuffle').addEventListener('change', (e) => {
  const wp = curWp();
  if (wp.type === 'slideshow' && wp.value) {
    setWp({ value: { ...wp.value, shuffle: e.target.checked } });
  }
});

$('#wp-parallax').addEventListener('change', (e) => setWp({ parallax: e.target.checked }));

for (const [id, prop, unit] of [['wp-dim', 'dim', '%'], ['wp-bright', 'bright', '%'], ['wp-blur', 'blur', 'px']]) {
  $('#' + id).addEventListener('input', (e) => {
    touch();
    const v = +e.target.value;
    $('#' + id + '-val').textContent = (prop === 'bright' ? '+' : '') + v + unit;
    debounced('wp:' + prop, 140, () => setWp({ [prop]: v }));
  });
}
$('#wp-animate').addEventListener('change', (e) => setWp({ animate: e.target.checked }));

// ---------------------------------------------------------------- フォントピッカー
const fontDropdown = $('#font-dropdown');
let fdOnPick = null;
let fdInput = null;

function gFontFamilies() {
  return (cfg.settings.googleFonts || []).map(f => f.family);
}

function openFontDropdown(input, onPick) {
  fdInput = input;
  fdOnPick = onPick;
  renderFontDropdown();
  const r = input.getBoundingClientRect();
  fontDropdown.style.display = 'block';
  fontDropdown.style.minWidth = Math.max(280, r.width) + 'px';
  const maxH = 300;
  if (r.bottom + maxH + 8 > innerHeight && r.top > maxH + 8) {
    fontDropdown.style.top = Math.max(8, r.top - maxH - 4) + 'px';
    fontDropdown.style.maxHeight = Math.min(maxH, r.top - 12) + 'px';
  } else {
    fontDropdown.style.top = (r.bottom + 4) + 'px';
    fontDropdown.style.maxHeight = Math.min(maxH, innerHeight - r.bottom - 16) + 'px';
  }
  fontDropdown.style.left = Math.min(r.left, innerWidth - 320) + 'px';
}

function renderFontDropdown() {
  if (!fdInput) return;
  const q = fdInput.value.trim().toLowerCase();
  const match = (n) => !q || n.toLowerCase().includes(q);
  const gf = gFontFamilies().filter(match);
  const sys = systemFonts.filter(match).slice(0, 400);
  let html = '';
  if (gf.length) {
    html += '<div class="fd-group">Google Fonts</div>';
    for (const f of gf) html += `<button class="fd-item" data-f="${esc(f)}" style="font-family:'${esc(f)}'"><span class="fd-cloud">G</span>${esc(f)}</button>`;
  }
  if (sys.length) {
    html += '<div class="fd-group">システムフォント</div>';
    for (const f of sys) html += `<button class="fd-item" data-f="${esc(f)}" style="font-family:'${esc(f)}'">${esc(f)}</button>`;
  }
  if (!html) html = '<div class="fd-empty">見つかりません</div>';
  fontDropdown.innerHTML = html;
  fontDropdown.scrollTop = 0;
}

fontDropdown.addEventListener('mousedown', (e) => {
  const item = e.target.closest('.fd-item');
  if (!item) return;
  e.preventDefault();
  const f = item.dataset.f;
  if (fdInput) fdInput.value = f;
  if (fdOnPick) fdOnPick(f);
  closeFontDropdown();
});

function closeFontDropdown() {
  fontDropdown.style.display = 'none';
  fdInput = null;
  fdOnPick = null;
}

document.addEventListener('mousedown', (e) => {
  if (fontDropdown.style.display === 'block' && !fontDropdown.contains(e.target) && e.target !== fdInput) {
    closeFontDropdown();
  }
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeFontDropdown(); });
// コンテンツ側を実際にスクロールした時だけ閉じる (ドロップダウン内のスクロールでは閉じない)
$('#content').addEventListener('scroll', () => closeFontDropdown());

function mkFontPicker(value, onPick) {
  const wrap = document.createElement('div');
  wrap.className = 'font-pick';
  const inp = document.createElement('input');
  inp.type = 'text';
  inp.value = value;
  inp.placeholder = 'フォント名で検索…';
  inp.addEventListener('focus', () => openFontDropdown(inp, onPick));
  inp.addEventListener('input', () => { if (fdInput === inp) renderFontDropdown(); else openFontDropdown(inp, onPick); });
  inp.addEventListener('change', () => onPick(inp.value));
  wrap.appendChild(inp);
  return wrap;
}

// ---------------------------------------------------------------- 小さな UI 部品
function ctlRow(labelText, ...els) {
  const row = document.createElement('div');
  row.className = 'row';
  const lab = document.createElement('label');
  lab.textContent = T(labelText);
  row.appendChild(lab);
  for (const el of els) row.appendChild(el);
  return row;
}

function mkRange(min, max, step, value, onInput) {
  const r = document.createElement('input');
  r.type = 'range'; r.min = min; r.max = max; r.step = step; r.value = value;
  const val = document.createElement('span');
  val.className = 'val';
  const show = (v) => { val.textContent = v; };
  show(value);
  r.addEventListener('input', () => { show(r.value); onInput(+r.value); });
  return [r, val, show];
}

function mkSelect(optionPairs, value, onChange) {
  const s = document.createElement('select');
  for (const [v, label] of optionPairs) {
    const o = document.createElement('option');
    o.value = v; o.textContent = T(label);
    s.appendChild(o);
  }
  s.value = String(value);
  s.addEventListener('change', () => onChange(s.value));
  return s;
}

function mkSeg(optionPairs, value, onChange) {
  const seg = document.createElement('div');
  seg.className = 'seg';
  for (const [v, label] of optionPairs) {
    const b = document.createElement('button');
    b.textContent = T(label);
    b.classList.toggle('on', String(v) === String(value));
    b.addEventListener('click', () => {
      [...seg.children].forEach(x => x.classList.toggle('on', x === b));
      onChange(v);
    });
    seg.appendChild(b);
  }
  return seg;
}

function mkCheck(labelText, checked, onChange) {
  const lab = document.createElement('label');
  const c = document.createElement('input');
  c.type = 'checkbox'; c.checked = !!checked;
  c.addEventListener('change', () => onChange(c.checked));
  lab.appendChild(c);
  lab.appendChild(document.createTextNode(' ' + T(labelText)));
  return lab;
}

function mkColor(value, onInput) {
  const c = document.createElement('input');
  c.type = 'color';
  c.value = value;
  c.addEventListener('input', () => onInput(c.value));
  return c;
}

function mkText(value, placeholder, onChange) {
  const t = document.createElement('input');
  t.type = 'text';
  t.value = value || '';
  t.placeholder = placeholder || '';
  t.style.flex = '1';
  t.addEventListener('change', () => onChange(t.value));
  return t;
}

function mkDelBtn(onClick, title = '削除') {
  const b = document.createElement('button');
  b.className = 'wc-del';
  b.title = title;
  b.appendChild(svgIcon('i-trash'));
  b.addEventListener('click', onClick);
  return b;
}

function noteEl(text) {
  const p = document.createElement('p');
  p.className = 'note';
  p.textContent = T(text);
  return p;
}

// ---------------------------------------------------------------- ウィジェットタブ
function renderAddRow() {
  const row = $('#add-row');
  row.innerHTML = '';
  for (const [type, meta] of Object.entries(TYPES)) {
    const b = document.createElement('button');
    b.className = 'add-btn';
    b.appendChild(svgIcon(meta.icon));
    b.appendChild(document.createTextNode(T(meta.label)));
    b.addEventListener('click', async () => {
      const created = await window.api.addWidget(type);
      if (created) expanded.add(created.id);
      widgetQuery = '';              // 絞り込み中でも、作ったものは必ず見えるように
      cfg = await baseConfig();
      renderWidgetList();
    });
    row.appendChild(b);
  }
}

// ---- タイプ別オプション UI ----
function typeOptionsUI(w) {
  const wrap = document.createElement('div');
  wrap.className = 'full';
  const o = w.options || {};

  if (w.type === 'clock') {
    const row = document.createElement('div');
    row.className = 'chk-row';
    row.appendChild(mkCheck('秒を表示', o.showSeconds, v => patchWidget(w.id, { options: { showSeconds: v } })));
    row.appendChild(mkCheck('12時間表示', o.hour12, v => patchWidget(w.id, { options: { hour12: v } })));
    row.appendChild(mkCheck('AM / PM を表示', o.showAmPm, v => patchWidget(w.id, { options: { showAmPm: v } })));
    wrap.appendChild(row);
    wrap.appendChild(noteEl('秒を表示すると毎秒描画になります。省電力を優先するなら分表示のままがおすすめです。'));

  } else if (w.type === 'analog') {
    const row = document.createElement('div');
    row.className = 'chk-row';
    row.appendChild(mkCheck('秒針', o.showSeconds !== false, v => patchWidget(w.id, { options: { showSeconds: v } })));
    row.appendChild(mkCheck('目盛り', o.showTicks !== false, v => patchWidget(w.id, { options: { showTicks: v } })));
    wrap.appendChild(row);
    wrap.appendChild(ctlRow('文字盤', mkSeg(
      [['dark', 'ダーク'], ['light', 'ライト'], ['none', 'なし']],
      o.face || 'dark', v => patchWidget(w.id, { options: { face: v } }))));
    {
      const [r, val, show] = mkRange(0, 90, 5, Math.round((o.faceOpacity ?? 0.25) * 100), v => {
        show(v + '%');
        patchWidget(w.id, { options: { faceOpacity: v / 100 } }, { debounce: true });
      });
      val.textContent = Math.round((o.faceOpacity ?? 0.25) * 100) + '%';
      wrap.appendChild(ctlRow('文字盤の濃さ', r, val));
    }

  } else if (w.type === 'date') {
    wrap.appendChild(ctlRow('表示形式', mkSelect([
      ['ja-long', '2026年8月19日 水曜日'],
      ['ja-md', '8月19日 (水)'],
      ['slash', '2026/08/19'],
      ['iso', '2026-08-19'],
      ['en-long', 'Wednesday, August 19'],
      ['en-md', 'Wed, Aug 19'],
    ], o.style || 'ja-long', v => patchWidget(w.id, { options: { style: v } }))));

  } else if (w.type === 'calendar') {
    const row = document.createElement('div');
    row.className = 'chk-row';
    row.appendChild(mkCheck('曜日の行', o.showWeekdays !== false, v => patchWidget(w.id, { options: { showWeekdays: v } })));
    row.appendChild(mkCheck('日曜・土曜に色', o.sundayColor !== false, v => patchWidget(w.id, { options: { sundayColor: v } })));
    row.appendChild(mkCheck('背景パネル', o.bg !== false, v => patchWidget(w.id, { options: { bg: v } })));
    wrap.appendChild(row);
    wrap.appendChild(ctlRow('今日の色', mkColor(o.accent || '#e3a94f', v => patchWidget(w.id, { options: { accent: v } }, { debounce: true }))));
    {
      const [r, val, show] = mkRange(0, 80, 5, Math.round((o.bgOpacity ?? 0.3) * 100), v => {
        show(v + '%');
        patchWidget(w.id, { options: { bgOpacity: v / 100 } }, { debounce: true });
      });
      val.textContent = Math.round((o.bgOpacity ?? 0.3) * 100) + '%';
      wrap.appendChild(ctlRow('背景の濃さ', r, val));
    }

  } else if (w.type === 'weather') {
    const cur = noteEl(`現在の都市: ${o.city || '未設定'}`);
    wrap.appendChild(cur);

    const searchRow = document.createElement('div');
    searchRow.className = 'row';
    const inp = mkText('', '都市名で検索 (例: 東京, Osaka)', () => {});
    const btn = document.createElement('button');
    btn.className = 'btn';
    btn.appendChild(svgIcon('i-search'));
    btn.appendChild(document.createTextNode('検索'));
    const results = document.createElement('div');
    results.className = 'city-results full';
    const doSearch = async () => {
      btn.disabled = true;
      const list = await window.api.searchCity(inp.value);
      btn.disabled = false;
      results.innerHTML = list.length ? '' : '<p class="note">見つかりませんでした</p>';
      for (const c of list) {
        const item = document.createElement('button');
        item.className = 'city-item';
        item.innerHTML = `${esc(c.name)}<span class="adm">${esc(c.admin)}</span>`;
        item.addEventListener('click', () => {
          patchWidget(w.id, { options: { city: c.name, lat: c.lat, lon: c.lon } });
          cur.textContent = `現在の都市: ${c.name}`;
          results.innerHTML = '';
          window.api.refreshWeather();
        });
        results.appendChild(item);
      }
    };
    btn.addEventListener('click', doSearch);
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(); });
    searchRow.appendChild(inp);
    searchRow.appendChild(btn);
    wrap.appendChild(searchRow);
    wrap.appendChild(results);

    const row = document.createElement('div');
    row.className = 'chk-row';
    row.appendChild(mkCheck('天気アイコン', o.showIcon !== false, v => patchWidget(w.id, { options: { showIcon: v } })));
    row.appendChild(mkCheck('都市名', o.showCity !== false, v => patchWidget(w.id, { options: { showCity: v } })));
    row.appendChild(mkCheck('天気の説明', o.showDesc !== false, v => patchWidget(w.id, { options: { showDesc: v } })));
    row.appendChild(mkCheck('最高 / 最低気温', !!o.showHiLow, v => patchWidget(w.id, { options: { showHiLow: v } })));
    wrap.appendChild(row);

  } else if (w.type === 'text') {
    const ta = document.createElement('textarea');
    ta.value = o.text || '';
    ta.placeholder = '表示するテキスト (改行可)';
    ta.addEventListener('input', () => patchWidget(w.id, { options: { text: ta.value } }, { debounce: true }));
    wrap.appendChild(ta);

  } else if (w.type === 'image') {
    const nameSpan = document.createElement('span');
    nameSpan.className = 'file-label';
    nameSpan.textContent = o.path ? o.path.split(/[\\/]/).pop() : '未選択';
    const pick = document.createElement('button');
    pick.className = 'btn';
    pick.textContent = '画像を選択…';
    pick.addEventListener('click', async () => {
      const p = await window.api.pickImage();
      if (!p) return;
      patchWidget(w.id, { options: { path: p } });
      nameSpan.textContent = p.split(/[\\/]/).pop();
    });
    wrap.appendChild(ctlRow('ファイル', nameSpan, pick));
    {
      const [r, val, show] = mkRange(3, 100, 0.5, o.w ?? 18, v => {
        show(v + '%');
        patchWidget(w.id, { options: { w: v } }, { debounce: true });
      });
      val.textContent = (o.w ?? 18) + '%';
      wrap.appendChild(ctlRow('幅 (画面比)', r, val));
    }
    {
      const [r, val, show] = mkRange(0, 60, 1, o.radius ?? 12, v => {
        show(v + 'px');
        patchWidget(w.id, { options: { radius: v } }, { debounce: true });
      });
      val.textContent = (o.radius ?? 12) + 'px';
      wrap.appendChild(ctlRow('角丸', r, val));
    }
    wrap.appendChild(noteEl('お気に入りの写真やロゴ、キャラクター画像 (透過 png も可) を壁紙の上に配置できます。編集モードのホイールで大きさを変えられます。'));

  } else if (w.type === 'stats') {
    const badge = document.createElement('span');
    badge.className = 'lhm-badge ' + (lhmOnline ? 'on' : 'off');
    badge.textContent = lhmOnline ? 'LHM 接続中' : 'LHM 未接続';
    const srcRow = ctlRow('データソース', mkSelect([
      ['auto', '自動 (LHM があれば使う)'],
      ['lhm', 'Libre Hardware Monitor'],
      ['builtin', '内蔵 (CPU/MEM のみ)'],
    ], o.source || 'auto', v => patchWidget(w.id, { options: { source: v } })));
    srcRow.appendChild(badge);
    wrap.appendChild(srcRow);

    const row = document.createElement('div');
    row.className = 'chk-row';
    row.appendChild(mkCheck('CPU', o.showCpu !== false, v => patchWidget(w.id, { options: { showCpu: v } })));
    row.appendChild(mkCheck('GPU', o.showGpu !== false, v => patchWidget(w.id, { options: { showGpu: v } })));
    row.appendChild(mkCheck('メモリ', o.showMem !== false, v => patchWidget(w.id, { options: { showMem: v } })));
    row.appendChild(mkCheck('ストレージ (SSD)', !!o.showDrives, v => patchWidget(w.id, { options: { showDrives: v } })));
    row.appendChild(mkCheck('ネットワーク', !!o.showNet, v => patchWidget(w.id, { options: { showNet: v } })));
    row.appendChild(mkCheck('温度を表示', o.showTemps !== false, v => patchWidget(w.id, { options: { showTemps: v } })));
    row.appendChild(mkCheck('1行にまとめる', !!o.compact, v => patchWidget(w.id, { options: { compact: v } })));
    row.appendChild(mkCheck('グラフを表示', !!o.showGraph, v => patchWidget(w.id, { options: { showGraph: v } })));
    wrap.appendChild(row);

    {
      const warn = document.createElement('input');
      warn.type = 'number'; warn.min = 40; warn.max = 110; warn.step = 1;
      warn.value = o.tempWarn || 85;
      warn.style.width = '72px';
      warn.addEventListener('change', () => patchWidget(w.id, { options: { tempWarn: +warn.value || 85 } }));
      const unit = document.createElement('span');
      unit.className = 'note';
      unit.style.padding = '0';
      unit.textContent = '°C 以上で赤く表示';
      wrap.appendChild(ctlRow('温度アラート', warn, unit));
    }

    wrap.appendChild(ctlRow('LHM URL', mkText(cfg.settings.lhmUrl, 'http://127.0.0.1:8085/data.json', v => {
      touch();
      cfg.settings.lhmUrl = v;
      window.api.setSettings({ lhmUrl: v });
    })));
    wrap.appendChild(noteEl('温度・GPU・SSD・ネット速度の表示には Libre Hardware Monitor が必要です。LHM を起動し、Options → Remote Web Server → Run を有効にしてください。'));

  } else if (w.type === 'countdown') {
    wrap.appendChild(ctlRow('タイトル', mkText(o.title, '例: 誕生日 / 締切 / 旅行', v => patchWidget(w.id, { options: { title: v } }))));
    {
      const d = document.createElement('input');
      d.type = 'date';
      d.value = o.date || '';
      d.addEventListener('change', () => patchWidget(w.id, { options: { date: d.value } }));
      wrap.appendChild(ctlRow('日付', d));
    }
    const row = document.createElement('div');
    row.className = 'chk-row';
    row.appendChild(mkCheck('過ぎたら経過日数を表示', o.showPast !== false, v => patchWidget(w.id, { options: { showPast: v } })));
    wrap.appendChild(row);
    wrap.appendChild(noteEl('複数のカウントダウンを置きたいときは、ウィジェットを複数追加してください。'));

  } else if (w.type === 'rss') {
    wrap.appendChild(ctlRow('フィード URL', mkText(o.url, 'https://…/rss.xml', v => patchWidget(w.id, { options: { url: v.trim() } }))));
    wrap.appendChild(ctlRow('表示件数', mkSelect(
      [['1', '1件'], ['2', '2件'], ['3', '3件'], ['5', '5件'], ['8', '8件']],
      String(o.count || 3), v => patchWidget(w.id, { options: { count: +v } }))));
    wrap.appendChild(ctlRow('見出しの切替', mkSelect(
      [['0', 'なし (リスト表示)'], ['10', '10秒ごとに1件'], ['30', '30秒ごとに1件'], ['60', '60秒ごとに1件']],
      String(o.rotateSec || 0), v => patchWidget(w.id, { options: { rotateSec: +v } }))));
    wrap.appendChild(noteEl('例: NHK https://www.nhk.or.jp/rss/news/cat0.xml ・ ITmedia https://rss.itmedia.co.jp/rss/2.0/news_bursts.xml ・ 30分ごとに自動更新します。'));

  } else if (w.type === 'ticker') {
    wrap.appendChild(ctlRow('銘柄 (カンマ区切り)', mkText(o.symbols, '例: AAPL, 7203.T, USDJPY=X, BTC-USD', v => patchWidget(w.id, { options: { symbols: v } }))));
    const row = document.createElement('div');
    row.className = 'chk-row';
    row.appendChild(mkCheck('前日比を表示', o.showChange !== false, v => patchWidget(w.id, { options: { showChange: v } })));
    wrap.appendChild(row);
    wrap.appendChild(noteEl('Yahoo Finance のティッカーが使えます。日本株は「7203.T」(トヨタ) のように .T、為替は「USDJPY=X」、暗号資産は「BTC-USD」。10分ごとに更新 (データは遅延があります)。'));

  } else if (w.type === 'nowplaying') {
    const row = document.createElement('div');
    row.className = 'chk-row';
    row.appendChild(mkCheck('アルバムアート', o.showArt !== false, v => patchWidget(w.id, { options: { showArt: v } })));
    row.appendChild(mkCheck('アーティスト名', o.showArtist !== false, v => patchWidget(w.id, { options: { showArtist: v } })));
    row.appendChild(mkCheck('再生ボタン', o.showControls !== false, v => patchWidget(w.id, { options: { showControls: v } })));
    row.appendChild(mkCheck('停止中は隠す', !!o.hideWhenStopped, v => patchWidget(w.id, { options: { hideWhenStopped: v } })));
    wrap.appendChild(row);
    for (const [key, label, min, max, def] of [['w', '幅', 200, 800, 320], ['h', '高さ', 60, 300, 96]]) {
      const [r, val, show] = mkRange(min, max, 5, o[key] ?? def, v => {
        show(v + 'px');
        patchWidget(w.id, { options: { [key]: v } }, { debounce: true });
      });
      val.textContent = (o[key] ?? def) + 'px';
      wrap.appendChild(ctlRow(label, r, val));
    }
    {
      const [r, val, show] = mkRange(0, 100, 5, Math.round((o.bgOpacity ?? 0.55) * 100), v => { show(v + '%'); patchWidget(w.id, { options: { bgOpacity: v / 100 } }, { debounce: true }); });
      val.textContent = Math.round((o.bgOpacity ?? 0.55) * 100) + '%';
      wrap.appendChild(ctlRow('背景の濃さ', r, val));
    }
    wrap.appendChild(noteEl('Spotify・ブラウザの YouTube など、Windows のメディア再生 (SMTC) に対応したアプリの曲名・ジャケットを表示し、デスクトップ上で再生 / 一時停止・曲送りができます。'));

  } else if (w.type === 'volume') {
    const row = document.createElement('div');
    row.className = 'chk-row';
    row.appendChild(mkCheck('出力デバイスの切替を表示', o.showDevices !== false, v => patchWidget(w.id, { options: { showDevices: v } })));
    wrap.appendChild(row);
    for (const [key, label, min, max, def] of [['w', '幅', 180, 600, 260], ['h', '高さ', 60, 260, 120]]) {
      const [r, val, show] = mkRange(min, max, 5, o[key] ?? def, v => {
        show(v + 'px');
        patchWidget(w.id, { options: { [key]: v } }, { debounce: true });
      });
      val.textContent = (o[key] ?? def) + 'px';
      wrap.appendChild(ctlRow(label, r, val));
    }
    {
      const [r, val, show] = mkRange(0, 100, 5, Math.round((o.bgOpacity ?? 0.6) * 100), v => { show(v + '%'); patchWidget(w.id, { options: { bgOpacity: v / 100 } }, { debounce: true }); });
      val.textContent = Math.round((o.bgOpacity ?? 0.6) * 100) + '%';
      wrap.appendChild(ctlRow('背景の濃さ', r, val));
    }
    wrap.appendChild(noteEl('デスクトップ上でスライダー (またはホイール) から音量を変更でき、再生先のスピーカー / ヘッドホンをその場で切り替えられます。'));

  } else if (w.type === 'note') {
    wrap.appendChild(ctlRow('タイトル', mkText(o.title, '例: メモ / TODO', v => patchWidget(w.id, { options: { title: v } }))));
    {
      const [r, val, show] = mkRange(140, 700, 10, o.w ?? 240, v => { show(v + 'px'); patchWidget(w.id, { options: { w: v } }, { debounce: true }); });
      val.textContent = (o.w ?? 240) + 'px';
      wrap.appendChild(ctlRow('幅', r, val));
    }
    {
      const [r, val, show] = mkRange(100, 600, 10, o.h ?? 180, v => { show(v + 'px'); patchWidget(w.id, { options: { h: v } }, { debounce: true }); });
      val.textContent = (o.h ?? 180) + 'px';
      wrap.appendChild(ctlRow('高さ', r, val));
    }
    {
      const [r, val, show] = mkRange(0, 100, 5, Math.round((o.bgOpacity ?? 0.6) * 100), v => { show(v + '%'); patchWidget(w.id, { options: { bgOpacity: v / 100 } }, { debounce: true }); });
      val.textContent = Math.round((o.bgOpacity ?? 0.6) * 100) + '%';
      wrap.appendChild(ctlRow('背景の濃さ', r, val));
    }
    wrap.appendChild(noteEl('デスクトップ上のカードに直接文字を書けます。内容は自動保存されます。'));

  } else if (w.type === 'pomo') {
    {
      const work = document.createElement('input');
      work.type = 'number'; work.min = 1; work.max = 120; work.value = o.workMin || 25;
      work.style.width = '64px';
      work.addEventListener('change', () => patchWidget(w.id, { options: { workMin: +work.value || 25 } }));
      const brk = document.createElement('input');
      brk.type = 'number'; brk.min = 1; brk.max = 60; brk.value = o.breakMin || 5;
      brk.style.width = '64px';
      brk.addEventListener('change', () => patchWidget(w.id, { options: { breakMin: +brk.value || 5 } }));
      const unit = document.createElement('span');
      unit.className = 'note';
      unit.style.padding = '0';
      unit.textContent = '分 (作業 / 休憩)';
      wrap.appendChild(ctlRow('時間', work, brk, unit));
    }
    {
      const [r, val, show] = mkRange(0, 100, 5, Math.round((o.bgOpacity ?? 0.6) * 100), v => { show(v + '%'); patchWidget(w.id, { options: { bgOpacity: v / 100 } }, { debounce: true }); });
      val.textContent = Math.round((o.bgOpacity ?? 0.6) * 100) + '%';
      wrap.appendChild(ctlRow('背景の濃さ', r, val));
    }
    wrap.appendChild(noteEl('デスクトップ上でクリックして開始・一時停止。作業セット完了時に通知が届きます。ホットキー (設定 → 一般) でも開始 / 停止できます。'));

  } else if (w.type === 'forecast') {
    const cur = noteEl(`現在の都市: ${o.city || '未設定'}`);
    wrap.appendChild(cur);
    const searchRow = document.createElement('div');
    searchRow.className = 'row';
    const inp = mkText('', '都市名で検索 (例: 東京, Osaka)', () => {});
    const btn = document.createElement('button');
    btn.className = 'btn';
    btn.appendChild(svgIcon('i-search'));
    btn.appendChild(document.createTextNode('検索'));
    const results = document.createElement('div');
    results.className = 'city-results full';
    const doSearch = async () => {
      btn.disabled = true;
      const list = await window.api.searchCity(inp.value);
      btn.disabled = false;
      results.innerHTML = list.length ? '' : '<p class="note">見つかりませんでした</p>';
      for (const c of list) {
        const item = document.createElement('button');
        item.className = 'city-item';
        item.innerHTML = `${esc(c.name)}<span class="adm">${esc(c.admin)}</span>`;
        item.addEventListener('click', () => {
          patchWidget(w.id, { options: { city: c.name, lat: c.lat, lon: c.lon } });
          cur.textContent = `現在の都市: ${c.name}`;
          results.innerHTML = '';
          window.api.refreshWeather();
        });
        results.appendChild(item);
      }
    };
    btn.addEventListener('click', doSearch);
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') doSearch(); });
    searchRow.appendChild(inp);
    searchRow.appendChild(btn);
    wrap.appendChild(searchRow);
    wrap.appendChild(results);
    wrap.appendChild(ctlRow('表示', mkSeg([['weekly', '週間'], ['hourly', '時間別']], o.mode || 'weekly', v => patchWidget(w.id, { options: { mode: v } }))));
    wrap.appendChild(ctlRow('件数', mkSelect([['3', '3'], ['4', '4'], ['5', '5'], ['6', '6'], ['7', '7']], String(o.count || 5), v => patchWidget(w.id, { options: { count: +v } }))));
    const fRow = document.createElement('div');
    fRow.className = 'chk-row';
    fRow.appendChild(mkCheck('天気アイコン', o.showIcons !== false, v => patchWidget(w.id, { options: { showIcons: v } })));
    wrap.appendChild(fRow);

  } else if (w.type === 'ics') {
    wrap.appendChild(ctlRow('カレンダー URL', mkText(o.url, 'https://calendar.google.com/…/basic.ics', v => patchWidget(w.id, { options: { url: v.trim() } }))));
    wrap.appendChild(ctlRow('表示する予定数', mkSelect([['3', '3件'], ['5', '5件'], ['8', '8件'], ['12', '12件']], String(o.count || 5), v => patchWidget(w.id, { options: { count: +v } }))));
    wrap.appendChild(ctlRow('先の期間', mkSelect([['1', '今日のみ'], ['3', '3日先まで'], ['7', '1週間先まで'], ['14', '2週間先まで']], String(o.daysAhead || 7), v => patchWidget(w.id, { options: { daysAhead: +v } }))));
    const iRow = document.createElement('div');
    iRow.className = 'chk-row';
    iRow.appendChild(mkCheck('時刻を表示', o.showTime !== false, v => patchWidget(w.id, { options: { showTime: v } })));
    wrap.appendChild(iRow);
    wrap.appendChild(noteEl('Google カレンダー: 設定 → 対象のカレンダー → 「iCal 形式の非公開 URL」をコピーして貼り付けてください。OAuth 連携は不要です。30分ごとに更新。繰り返し予定は基本的なもの (毎日・毎週・毎月) に対応しています。'));

  } else if (w.type === 'worldclock') {
    const ta = document.createElement('textarea');
    ta.value = o.zones || '';
    ta.placeholder = '表示名=タイムゾーン (1行に1つ)\n例: ニューヨーク=America/New_York';
    ta.addEventListener('change', () => patchWidget(w.id, { options: { zones: ta.value } }));
    wrap.appendChild(ta);
    const wRow = document.createElement('div');
    wRow.className = 'chk-row';
    wRow.appendChild(mkCheck('日付も表示', !!o.showDate, v => patchWidget(w.id, { options: { showDate: v } })));
    wRow.appendChild(mkCheck('12時間表示', !!o.hour12, v => patchWidget(w.id, { options: { hour12: v } })));
    wrap.appendChild(wRow);
    wrap.appendChild(noteEl('タイムゾーン名の例: Asia/Tokyo ・ America/New_York ・ America/Los_Angeles ・ Europe/London ・ Europe/Paris ・ Australia/Sydney'));

  } else if (w.type === 'switcher' || w.type === 'modeswitch') {
    const forIcons = true;   // 統合後はどちらのボタンもモードを切り替える
    wrap.appendChild(ctlRow(forIcons ? '並べるモード' : '並べるレイアウト', mkText((o.items || []).join(', '),
      '空欄 = 保存済みすべて / 例: 通常, 仕事用, ゲーム用',
      v => patchWidget(w.id, { options: { items: v.split(',').map(x => x.trim()).filter(Boolean) } }))));
    wrap.appendChild(ctlRow('並び', mkCheck('縦に並べる', !!o.vertical,
      v => patchWidget(w.id, { options: { vertical: v } }))));
    for (const [key, label, min, max, def] of [['w', '幅', 110, 700, 300], ['h', '高さ', 34, 400, 46]]) {
      const [r, val, show] = mkRange(min, max, 2, o[key] ?? def, v => { show(v + 'px'); patchWidget(w.id, { options: { [key]: v } }, { debounce: true }); });
      val.textContent = (o[key] ?? def) + 'px';
      wrap.appendChild(ctlRow(label, r, val));
    }
    {
      const [r, val, show] = mkRange(0, 100, 5, Math.round((o.bgOpacity ?? 0.55) * 100), v => { show(v + '%'); patchWidget(w.id, { options: { bgOpacity: v / 100 } }, { debounce: true }); });
      val.textContent = Math.round((o.bgOpacity ?? 0.55) * 100) + '%';
      wrap.appendChild(ctlRow('背景の濃さ', r, val));
    }
    wrap.appendChild(noteEl(forIcons
      ? 'デスクトップ上のボタンでアイコンのモードを切り替えられます。いま当たっているモードのボタンが光ります。モードにウィジェットを連動させていれば、ウィジェットも一緒に入れ替わります。'
      : 'デスクトップ上のボタンでレイアウトを切り替えられます。いま当たっているレイアウトのボタンが光ります。シーンが「状況で自動」なら、こちらは「手で今すぐ」です。'));
  } else if (w.type === 'todo') {
    wrap.appendChild(ctlRow('タイトル', mkText(o.title, '例: ToDo / 買い物リスト', v => patchWidget(w.id, { options: { title: v } }))));
    for (const [key, label, min, max, def] of [['w', '幅', 170, 600, 250], ['h', '高さ', 120, 600, 220]]) {
      const [r, val, show] = mkRange(min, max, 10, o[key] ?? def, v => { show(v + 'px'); patchWidget(w.id, { options: { [key]: v } }, { debounce: true }); });
      val.textContent = (o[key] ?? def) + 'px';
      wrap.appendChild(ctlRow(label, r, val));
    }
    {
      const [r, val, show] = mkRange(0, 100, 5, Math.round((o.bgOpacity ?? 0.6) * 100), v => { show(v + '%'); patchWidget(w.id, { options: { bgOpacity: v / 100 } }, { debounce: true }); });
      val.textContent = Math.round((o.bgOpacity ?? 0.6) * 100) + '%';
      wrap.appendChild(ctlRow('背景の濃さ', r, val));
    }
    wrap.appendChild(noteEl('デスクトップ上で直接タスクを追加・チェックできます。完了したタスクは自動で下に移動します。'));

  } else if (w.type === 'battery') {
    const bRow = document.createElement('div');
    bRow.className = 'chk-row';
    bRow.appendChild(mkCheck('残量バーを表示', o.showBar !== false, v => patchWidget(w.id, { options: { showBar: v } })));
    wrap.appendChild(bRow);
    {
      const warn = document.createElement('input');
      warn.type = 'number'; warn.min = 5; warn.max = 60; warn.value = o.warnAt ?? 20;
      warn.style.width = '72px';
      warn.addEventListener('change', () => patchWidget(w.id, { options: { warnAt: +warn.value || 20 } }));
      const unit = document.createElement('span');
      unit.className = 'note'; unit.style.padding = '0';
      unit.textContent = '% 以下で赤く表示';
      wrap.appendChild(ctlRow('残量アラート', warn, unit));
    }
    wrap.appendChild(noteEl('ノート PC 向けです。バッテリーのないデスクトップ PC では「バッテリー情報なし」と表示されます。'));

  } else if (w.type === 'disk') {
    wrap.appendChild(ctlRow('対象ドライブ', mkText(o.drives, '空欄で全ドライブ / 例: C,D', v => patchWidget(w.id, { options: { drives: v } }))));
    const dRow = document.createElement('div');
    dRow.className = 'chk-row';
    dRow.appendChild(mkCheck('使用量バーを表示', o.showBar !== false, v => patchWidget(w.id, { options: { showBar: v } })));
    wrap.appendChild(dRow);
    wrap.appendChild(noteEl('5分ごとに更新。使用率 90% 以上のドライブは赤いバーになります。'));

  } else if (w.type === 'netinfo') {
    const nRow = document.createElement('div');
    nRow.className = 'chk-row';
    nRow.appendChild(mkCheck('ローカル IP', o.showIp !== false, v => patchWidget(w.id, { options: { showIp: v } })));
    nRow.appendChild(mkCheck('Wi-Fi 名 (SSID)', o.showSsid !== false, v => patchWidget(w.id, { options: { showSsid: v } })));
    nRow.appendChild(mkCheck('遅延 (PING)', o.showPing !== false, v => patchWidget(w.id, { options: { showPing: v } })));
    nRow.appendChild(mkCheck('遅延グラフ', !!o.showGraph, v => patchWidget(w.id, { options: { showGraph: v } })));
    wrap.appendChild(nRow);
    wrap.appendChild(noteEl('遅延は 1.1.1.1 への接続時間を 30 秒ごとに計測します。有線接続では SSID は表示されません。'));

  } else if (w.type === 'visualizer') {
    {
      const [r, val, show] = mkRange(12, 512, 4, o.bars ?? 48, v => { show(v); patchWidget(w.id, { options: { bars: v } }, { debounce: true }); });
      val.textContent = o.bars ?? 48;
      wrap.appendChild(ctlRow('バーの本数', r, val));
    }
    for (const [key, label, min, max, def, unit] of [['wPct', '幅 (画面比)', 10, 100, 40, '%'], ['hPx', '高さ', 30, 300, 90, 'px']]) {
      const [r, val, show] = mkRange(min, max, 2, o[key] ?? def, v => { show(v + unit); patchWidget(w.id, { options: { [key]: v } }, { debounce: true }); });
      val.textContent = (o[key] ?? def) + unit;
      wrap.appendChild(ctlRow(label, r, val));
    }
    const vRow = document.createElement('div');
    vRow.className = 'chk-row';
    vRow.appendChild(mkCheck('中央から上下対称', o.mirror !== false, v => patchWidget(w.id, { options: { mirror: v } })));
    wrap.appendChild(vRow);

    // どの出力の音に反応するか (チェック無し = すべての出力)
    {
      const box = document.createElement('div');
      box.className = 'vis-devs';
      const note = document.createElement('p');
      note.className = 'foot-note';
      note.textContent = T('チェックした出力が既定のときだけ動きます。何も選ばなければ、どの出力でも動きます。');
      wrap.appendChild(ctlRow('反応する出力', box));
      wrap.appendChild(note);
      (async () => {
        const a = await window.api.audioDevices();
        const devs = (a && a.devices) || [];
        if (!devs.length) {
          box.textContent = T('出力デバイスを取得できませんでした');
          return;
        }
        const sel = new Set((o.devices || []));
        for (const d of devs) {
          const lab = document.createElement('label');
          lab.className = 'vis-dev';
          const c = document.createElement('input');
          c.type = 'checkbox';
          c.checked = sel.has(d.id);
          c.addEventListener('change', () => {
            if (c.checked) sel.add(d.id); else sel.delete(d.id);
            patchWidget(w.id, { options: { devices: [...sel] } });
          });
          lab.appendChild(c);
          lab.appendChild(document.createTextNode(' ' + d.name + (d.id === a.current ? T(' (いまの既定)') : '')));
          box.appendChild(lab);
        }
      })();
    }
    wrap.appendChild(noteEl('システム音声に反応するスペクトラムです。左が低音、右が高音で、音の高さに合わせて位置が動きます。バーは 512 本まで増やせます (増やすほど隙間が詰まります)。音が鳴っている間だけ描画し、静かなときは止まります。初回はキャプチャ開始まで数秒かかることがあります。'));

  } else if (w.type === 'zone') {
    {
      const [r, val, show] = mkRange(4, 100, 0.5, o.w ?? 22, v => { show(v + '%'); patchWidget(w.id, { options: { w: v } }, { debounce: true }); });
      val.textContent = (o.w ?? 22) + '%';
      wrap.appendChild(ctlRow('幅', r, val));
    }
    {
      const [r, val, show] = mkRange(4, 100, 0.5, o.h ?? 34, v => { show(v + '%'); patchWidget(w.id, { options: { h: v } }, { debounce: true }); });
      val.textContent = (o.h ?? 34) + '%';
      wrap.appendChild(ctlRow('高さ', r, val));
    }
    {
      const [r, val, show] = mkRange(0, 40, 1, o.radius ?? 16, v => { show(v + 'px'); patchWidget(w.id, { options: { radius: v } }, { debounce: true }); });
      val.textContent = (o.radius ?? 16) + 'px';
      wrap.appendChild(ctlRow('角丸', r, val));
    }
    {
      const fill = mkColor(o.fill || '#4f8cff', v => patchWidget(w.id, { options: { fill: v } }, { debounce: true }));
      const [r, val, show] = mkRange(0, 60, 1, Math.round((o.fillOpacity ?? 0.08) * 100), v => { show(v + '%'); patchWidget(w.id, { options: { fillOpacity: v / 100 } }, { debounce: true }); });
      val.textContent = Math.round((o.fillOpacity ?? 0.08) * 100) + '%';
      wrap.appendChild(ctlRow('塗りつぶし', fill, r, val));
    }
    {
      const bc = mkColor(o.borderColor || '#7db4ff', v => patchWidget(w.id, { options: { borderColor: v } }, { debounce: true }));
      const style = mkSelect([['dashed', '破線'], ['solid', '実線'], ['dotted', '点線'], ['none', 'なし']], o.borderStyle || 'dashed', v => patchWidget(w.id, { options: { borderStyle: v } }));
      const [r, val, show] = mkRange(0.5, 6, 0.5, o.borderWidth ?? 1.5, v => { show(v + 'px'); patchWidget(w.id, { options: { borderWidth: v } }, { debounce: true }); });
      val.textContent = (o.borderWidth ?? 1.5) + 'px';
      wrap.appendChild(ctlRow('枠線', bc, style, r, val));
    }
    wrap.appendChild(ctlRow('ラベル', mkText(o.label, '例: ゲーム / 仕事 / よく使う', v => patchWidget(w.id, { options: { label: v } }))));
    wrap.appendChild(ctlRow('ラベル位置', mkSelect([
      ['tl', '左上'], ['tc', '中央上'], ['tr', '右上'], ['bl', '左下'], ['out', '枠の外 (上)'],
    ], o.labelPos || 'tl', v => patchWidget(w.id, { options: { labelPos: v } }))));
    wrap.appendChild(noteEl('デスクトップのアイコンを囲んで「ゲーム」「仕事」のように仕分けできます。編集モードで右下ハンドルからリサイズ。'));

  } else if (w.type === 'line') {
    wrap.appendChild(ctlRow('向き', mkSeg([['h', '横'], ['v', '縦']], o.orient || 'h', v => patchWidget(w.id, { options: { orient: v } }))));
    {
      const [r, val, show] = mkRange(3, 100, 0.5, o.len ?? 26, v => { show(v + '%'); patchWidget(w.id, { options: { len: v } }, { debounce: true }); });
      val.textContent = (o.len ?? 26) + '%';
      wrap.appendChild(ctlRow('長さ', r, val));
    }
    {
      const [r, val, show] = mkRange(1, 14, 1, o.thick ?? 2, v => { show(v + 'px'); patchWidget(w.id, { options: { thick: v } }, { debounce: true }); });
      val.textContent = (o.thick ?? 2) + 'px';
      wrap.appendChild(ctlRow('太さ', r, val));
    }
    wrap.appendChild(ctlRow('スタイル', mkSeg([['solid', '実線'], ['dashed', '破線'], ['dotted', '点線']], o.style || 'solid', v => patchWidget(w.id, { options: { style: v } }))));

  } else if (w.type === 'folder') {
    wrap.appendChild(ctlRow('タイトル', mkText(o.title, '例: ゲーム / ツール', v => patchWidget(w.id, { options: { title: v } }))));

    const addBtn = document.createElement('button');
    addBtn.className = 'btn';
    addBtn.appendChild(svgIcon('i-plus'));
    addBtn.appendChild(document.createTextNode('アプリ・ショートカットを追加…'));
    const list = document.createElement('div');
    list.className = 'fitem-list';

    const keyOf = (it) => it.url || it.path;
    const labelOf = (it) => it.name || keyOf(it);

    const renderItems = () => {
      list.innerHTML = '';
      for (const [i, it] of (o.items || []).entries()) {
        const row = document.createElement('div');
        row.className = 'fitem';
        row.draggable = true;                      // つまんで順番を変えられる
        row.dataset.idx = String(i);

        const grip = document.createElement('span');
        grip.className = 'fi-grip';
        grip.textContent = '⋮⋮';
        row.appendChild(grip);

        const img = document.createElement('img');
        (it.url ? window.api.getUrlIcon(it.url) : window.api.getIcon(it.path))
          .then(u => { if (u) img.src = u; })
          .catch(() => {});
        const name = document.createElement('span');
        name.className = 'fi-name';
        name.textContent = labelOf(it);
        name.title = keyOf(it);
        row.append(img, name);
        if (it.url) {
          const tag = document.createElement('span');
          tag.className = 'fi-tag';
          tag.textContent = T('リンク');
          row.appendChild(tag);
        }
        row.appendChild(mkDelBtn(() => {
          o.items.splice(i, 1);
          patchWidget(w.id, { options: { items: o.items } });
          renderItems();
        }));

        // --- 並び替え ---
        row.addEventListener('dragstart', (e) => {
          e.dataTransfer.setData('text/ww-fitem', String(i));
          e.dataTransfer.effectAllowed = 'move';
          row.classList.add('dragging');
        });
        row.addEventListener('dragend', () => row.classList.remove('dragging'));
        row.addEventListener('dragover', (e) => {
          if (![...e.dataTransfer.types].includes('text/ww-fitem')) return;
          e.preventDefault();
          e.stopPropagation();                     // 下の「追加」ドロップに渡さない
          e.dataTransfer.dropEffect = 'move';
          const rc = row.getBoundingClientRect();
          const before = e.clientY < rc.top + rc.height / 2;
          row.classList.toggle('drop-before', before);
          row.classList.toggle('drop-after', !before);
        });
        row.addEventListener('dragleave', (e) => {
          if (e.relatedTarget && row.contains(e.relatedTarget)) return;
          row.classList.remove('drop-before', 'drop-after');
        });
        row.addEventListener('drop', (e) => {
          const raw = e.dataTransfer.getData('text/ww-fitem');
          if (raw === '') return;
          e.preventDefault();
          e.stopPropagation();
          const rc = row.getBoundingClientRect();
          const before = e.clientY < rc.top + rc.height / 2;
          row.classList.remove('drop-before', 'drop-after');
          const from = Number(raw);
          if (Number.isNaN(from) || from === i) return;
          const arr = o.items.slice();
          const [moved] = arr.splice(from, 1);
          let at = arr.indexOf(o.items[i]);
          if (at < 0) at = i;
          arr.splice(before ? at : at + 1, 0, moved);
          o.items = arr;
          patchWidget(w.id, { options: { items: o.items } });
          renderItems();
        });

        list.appendChild(row);
      }
    };
    addBtn.addEventListener('click', async () => {
      const picked = await window.api.pickFolderItems();
      if (!picked.length) return;
      o.items = [...(o.items || []), ...picked];
      patchWidget(w.id, { options: { items: o.items } });
      renderItems();
    });
    wrap.appendChild(ctlRow('アイテム', addBtn));

    // リンク (既定のブラウザで開く)
    {
      const urlIn = document.createElement('input');
      urlIn.type = 'text';
      urlIn.placeholder = 'https://example.com';
      urlIn.style.flex = '1';
      const nameIn = document.createElement('input');
      nameIn.type = 'text';
      nameIn.placeholder = T('名前 (省略可)');
      nameIn.style.width = '120px';
      const go = document.createElement('button');
      go.className = 'btn';
      go.textContent = T('リンクを追加');
      const addLink = () => {
        let u = urlIn.value.trim();
        if (!u) return;
        if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
        let host = '';
        try { host = new URL(u).hostname.replace(/^www\./, ''); } catch (_) {
          toast(T('URL が正しくありません'));
          return;
        }
        if ((o.items || []).some(x => x.url === u)) { toast(T('もう入っています')); return; }
        o.items = [...(o.items || []), { url: u, name: nameIn.value.trim() || host }];
        patchWidget(w.id, { options: { items: o.items } });
        urlIn.value = '';
        nameIn.value = '';
        renderItems();
        toast(T('リンクを追加しました'));
      };
      go.addEventListener('click', addLink);
      for (const el of [urlIn, nameIn]) {
        el.addEventListener('keydown', (e) => { if (e.key === 'Enter') addLink(); });
      }
      const ctl = document.createElement('div');
      ctl.className = 'ctl gf-ctl';
      ctl.append(urlIn, nameIn, go);
      const row2 = document.createElement('div');
      row2.className = 'row';
      const lab = document.createElement('label');
      lab.textContent = T('リンク');
      row2.append(lab, ctl);
      wrap.appendChild(row2);
    }

    // エクスプローラーからのドラッグ&ドロップでも追加できる (複数まとめて可)
    const dz = document.createElement('div');
    dz.className = 'fitem-drop';
    dz.textContent = T('ここへドラッグでも追加できます (複数まとめて OK)');
    const addPaths = (paths) => {
      if (!paths.length) return;
      const have = new Set((o.items || []).map(x => x.url || x.path));
      const add = [];
      for (const p2 of paths) {
        if (have.has(p2)) continue;
        have.add(p2);
        if (/^https?:\/\//i.test(p2)) {
          let host = p2;
          try { host = new URL(p2).hostname.replace(/^www\./, ''); } catch (_) {}
          add.push({ url: p2, name: host });
        } else {
          add.push({ path: p2, name: p2.split(/[\\/]/).pop().replace(/\.(lnk|exe|url|bat)$/i, '') });
        }
      }
      if (!add.length) return;
      o.items = [...(o.items || []), ...add];
      patchWidget(w.id, { options: { items: o.items } });
      renderItems();
      toast(T('{n} 個を追加しました').replace('{n}', add.length));
    };
    const onDrop = (e) => {
      e.preventDefault();
      e.stopPropagation();
      dz.classList.remove('over');
      list.classList.remove('over');
      // FileList のままでは contextBridge を渡れない。File の配列にして渡す
      const files = [...(e.dataTransfer.files || [])];
      const paths = window.api.droppedPaths(files);
      // ブラウザからのリンクドロップも受ける
      const uri = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
      const links = String(uri || '').split(/\r?\n/)
        .map(x => x.trim()).filter(x => /^https?:\/\//i.test(x));
      if (files.length && !paths.length && !links.length) {
        toast(T('ファイルのパスを取得できませんでした'));
        return;
      }
      addPaths([...paths, ...links]);
    };
    for (const el of [dz, list]) {
      el.addEventListener('dragover', (e) => {
        if (![...e.dataTransfer.types].includes('Files')) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        el.classList.add('over');
      });
      el.addEventListener('dragleave', (e) => {
        if (e.relatedTarget && el.contains(e.relatedTarget)) return;
        el.classList.remove('over');
      });
      el.addEventListener('drop', onDrop);
    }
    wrap.appendChild(dz);
    wrap.appendChild(list);
    renderItems();

    wrap.appendChild(ctlRow('並べ方', mkSelect(
      [['grid', '格子'], ['circle', '円形']],
      o.layout === 'circle' ? 'circle' : 'grid',
      v => { patchWidget(w.id, { options: { layout: v } }); renderWidgetList(); })));
    if (o.layout !== 'circle') {
      wrap.appendChild(ctlRow('列数', mkSelect([
        ['0', '自動'], ['1', '1'], ['2', '2'], ['3', '3'], ['4', '4'], ['5', '5'], ['6', '6'],
      ], String(o.columns || 0), v => patchWidget(w.id, { options: { columns: +v } }))));
    }
    {
      const [r, val, show] = mkRange(20, 160, 2, o.iconSize ?? 34, v => { show(v + 'px'); patchWidget(w.id, { options: { iconSize: v } }, { debounce: true }); });
      val.textContent = (o.iconSize ?? 34) + 'px';
      wrap.appendChild(ctlRow('アイコンサイズ', r, val));
    }
    {
      const [r, val, show] = mkRange(0, 100, 5, Math.round((o.bgOpacity ?? 0.55) * 100), v => { show(v + '%'); patchWidget(w.id, { options: { bgOpacity: v / 100 } }, { debounce: true }); });
      val.textContent = Math.round((o.bgOpacity ?? 0.55) * 100) + '%';
      wrap.appendChild(ctlRow('背景の濃さ', r, val));
    }
    const row = document.createElement('div');
    row.className = 'chk-row';
    row.appendChild(mkCheck('名前を表示', o.showLabels !== false, v => patchWidget(w.id, { options: { showLabels: v } })));
    wrap.appendChild(row);
    wrap.appendChild(noteEl('.exe だけでなく .lnk (ショートカット) や .url もアイコン付きで追加できます。リンクは既定のブラウザで開きます (アイコンはそのサイトから取得し、取れないときは頭文字のタイルになります)。一覧はつまんで並び替えられ、デスクトップのウィジェットへ直接ドロップしても追加できます。'));
  }
  return wrap;
}

// タイプごとの表示コントロール
const NO_FONT_TYPES = new Set(['line', 'image', 'analog']);
const NO_SHADOW_TYPES = new Set(['line']);

let activeModeNames = [];           // いま効いている (重なっている) モード名
let widgetQuery = '';               // ウィジェットの絞り込み文字列
// 名前を付ける鉛筆 (ウィジェットの見出しとアイコン一覧で共用)
const PEN_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17z"/></svg>';

// そのウィジェットのモニタが、いま外れているか。
// 判定は鍵 (再起動で変わらない) だけで行う。displayId は再起動で変わるので使わない
function orphanDisplay(w) {
  if (!w.displayKey) return false;
  return !displays.some(d => d.key === w.displayKey);
}

function widgetCard(w) {
  const meta = TYPES[w.type] || { icon: 'i-widgets', label: w.type };
  const card = document.createElement('div');
  card.dataset.wid = w.id;
  card.className = 'widget-card' + (expanded.has(w.id) ? ' open' : '') + (w.off ? ' is-off' : '');

  const head = document.createElement('div');
  head.className = 'wc-head';
  const glyph = document.createElement('span');
  glyph.className = 'wc-glyph';
  glyph.appendChild(svgIcon(meta.icon));
  const title = document.createElement('span');
  title.className = 'wc-title';
  // 呼び名を付けていればそれを見出しにする (同じ種類が並ぶと見分けが付かないため)
  title.textContent = w.name || T(meta.label);

  // 見出しから直接、名前を付けたり変えたりできる
  const pen = document.createElement('button');
  pen.className = 'wc-pen';
  pen.title = T('名前を付ける');
  pen.innerHTML = PEN_SVG;
  pen.addEventListener('click', (e) => {
    e.stopPropagation();
    touch();                         // 入力中に onConfig で一覧を作り直されないように
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.className = 'wc-name-in';
    inp.value = w.name || '';
    inp.placeholder = T(meta.label);
    inp.maxLength = 24;
    let done = false;
    const save = () => {
      if (done) return;
      done = true;
      patchWidget(w.id, { name: inp.value.trim().slice(0, 24) });
      renderWidgetList();
    };
    inp.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') save();
      if (ev.key === 'Escape') { done = true; renderWidgetList(); }
    });
    inp.addEventListener('blur', save);
    inp.addEventListener('click', (ev) => ev.stopPropagation());
    title.replaceWith(inp);
    inp.focus();
    inp.select();
  });

  const sub = document.createElement('span');
  sub.className = 'wc-sub';
  // 名前を付けると種類が見出しから消えるので、副題に残しておく
  sub.textContent = [
    w.name ? T(meta.label) : '',
    NO_FONT_TYPES.has(w.type) ? '' : `${w.font} ・ ${w.size}px`,
    orphanDisplay(w) ? T('未接続のモニタ')
      : (displays.length > 1 ? `${T('モニタ')}${(w.display || 0) + 1}` : ''),
  ].filter(Boolean).join(' ・ ');
  const spacer = document.createElement('span');
  spacer.className = 'wc-spacer';
  const chev = document.createElement('span');
  chev.className = 'wc-chev';
  chev.appendChild(svgIcon('i-chev'));

  head.appendChild(glyph);
  head.appendChild(title);
  head.appendChild(pen);
  head.appendChild(sub);
  head.appendChild(spacer);
  // 消さずにしまう / 出す
  const offBtn = document.createElement('button');
  offBtn.className = 'wc-off' + (w.off ? ' on' : '');
  offBtn.title = T(w.off ? 'いまは隠しています。押すと出します' : '押すと隠します (設定は残ります)');
  offBtn.appendChild(svgIcon('i-power'));
  offBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    patchWidget(w.id, { off: !w.off });
    renderWidgetList();
  });
  head.appendChild(offBtn);

  head.appendChild(mkDelBtn(async (e) => {
    e.stopPropagation();
    expanded.delete(w.id);
    await window.api.removeWidget(w.id);
    cfg = await baseConfig();
    renderWidgetList();
  }));
  head.appendChild(chev);
  head.addEventListener('click', (e) => {
    if (e.target.closest('.wc-del') || e.target.closest('.wc-pen')) return;
    if (e.target.closest('.wc-name-in')) return;
    if (expanded.has(w.id)) expanded.delete(w.id); else expanded.add(w.id);
    card.classList.toggle('open');
  });
  card.appendChild(head);

  const body = document.createElement('div');
  body.className = 'wc-body';
  const grid = document.createElement('div');
  grid.className = 'wc-grid';

  grid.appendChild(ctlRow('呼び名', mkText(w.name, T(meta.label) + T(' (空欄なら種類名)'),
    v => { patchWidget(w.id, { name: v.trim().slice(0, 24) }); renderWidgetList(); })));

  if (displays.length > 1 || orphanDisplay(w)) {
    const opts = displays.map(d => [String(d.index), d.label]);
    let value = String(w.display || 0);
    if (orphanDisplay(w)) {
      opts.unshift(['__gone', T('未接続のモニタ (つないだら戻ります)')]);
      value = '__gone';
    }
    grid.appendChild(ctlRow('モニタ', mkSelect(opts, value, v => {
      if (v === '__gone') return;         // そのまま待つ選択
      const d = displays.find(x => String(x.index) === v);
      patchWidget(w.id, { display: +v, displayKey: (d && d.key) || '', displayId: (d && d.id) || '' });
      renderWidgetList();
    })));
  }

  if (!NO_FONT_TYPES.has(w.type)) {
    grid.appendChild(ctlRow('フォント', mkFontPicker(w.font, f => patchWidget(w.id, { font: f }))));
    grid.appendChild(ctlRow('太さ', mkSelect(
      [['100', '100 (極細)'], ['200', '200'], ['300', '300'], ['400', '400 (標準)'], ['500', '500'], ['600', '600'], ['700', '700 (太字)'], ['800', '800'], ['900', '900 (極太)']],
      w.weight, v => patchWidget(w.id, { weight: +v }))));
    {
      const [r, val, show] = mkRange(8, 400, 1, w.size, v => {
        show(v + 'px');
        patchWidget(w.id, { size: v }, { debounce: true });
      });
      val.textContent = w.size + 'px';
      grid.appendChild(ctlRow('サイズ', r, val));
    }
    {
      const [r, val, show] = mkRange(0, 30, 1, w.letterSpacing, v => {
        show(v + 'px');
        patchWidget(w.id, { letterSpacing: v }, { debounce: true });
      });
      val.textContent = w.letterSpacing + 'px';
      grid.appendChild(ctlRow('字間', r, val));
    }
  }

  if (w.type === 'analog') {
    const [r, val, show] = mkRange(60, 600, 2, w.size, v => {
      show(v + 'px');
      patchWidget(w.id, { size: v }, { debounce: true });
    });
    val.textContent = w.size + 'px';
    grid.appendChild(ctlRow('直径', r, val));
  }

  grid.appendChild(ctlRow(w.type === 'analog' ? '針の色' : '色',
    mkColor(w.color, v => patchWidget(w.id, { color: v }, { debounce: true }))));

  if (!NO_SHADOW_TYPES.has(w.type) && w.type !== 'analog') {
    grid.appendChild(ctlRow('影', mkSeg(
      [['soft', 'ソフト'], ['glow', 'ネオン'], ['none', 'なし']],
      w.shadow, v => patchWidget(w.id, { shadow: v }))));
  }

  {
    const [r, val, show] = mkRange(10, 100, 5, Math.round(w.opacity * 100), v => {
      show(v + '%');
      patchWidget(w.id, { opacity: v / 100 }, { debounce: true });
    });
    val.textContent = Math.round(w.opacity * 100) + '%';
    grid.appendChild(ctlRow('不透明度', r, val));
  }

  {
    const x = document.createElement('input');
    x.type = 'number'; x.min = 0; x.max = 100; x.step = 0.5; x.value = w.x;
    x.style.width = '72px';
    x.addEventListener('change', () => patchWidget(w.id, { x: +x.value }));
    const y = document.createElement('input');
    y.type = 'number'; y.min = 0; y.max = 100; y.step = 0.5; y.value = w.y;
    y.style.width = '72px';
    y.addEventListener('change', () => patchWidget(w.id, { y: +y.value }));
    const pct = document.createElement('span');
    pct.className = 'note';
    pct.style.padding = '0';
    pct.textContent = '% (X, Y)';
    grid.appendChild(ctlRow('位置', x, y, pct));
  }

  {
    const lockRow = ctlRow('位置をロック');
    const ctl = document.createElement('div');
    ctl.className = 'ctl';
    const sw = document.createElement('label');
    sw.className = 'switch';
    const chk = document.createElement('input');
    chk.type = 'checkbox';
    chk.checked = !!w.locked;
    chk.addEventListener('change', () => patchWidget(w.id, { locked: chk.checked }));
    const knob = document.createElement('span');
    knob.className = 'knob';
    sw.appendChild(chk);
    sw.appendChild(knob);
    ctl.appendChild(sw);
    lockRow.appendChild(ctl);
    grid.appendChild(lockRow);
  }

  grid.appendChild(typeOptionsUI(w));
  body.appendChild(grid);
  card.appendChild(body);
  return card;
}

function renderWidgetList() {
  const list = $('#widget-list');
  list.innerHTML = '';
  if (!cfg.widgets.length) {
    list.innerHTML = '<p class="hint">ウィジェットがありません。上のボタンから追加してください。</p>';
    return;
  }

  // しまってあるものがあれば、まとめて出せる逃げ道を上に置く
  const hidden = cfg.widgets.filter(w => w.off).length;
  if (hidden) {
    const row = document.createElement('div');
    row.className = 'gf-item';
    const nm = document.createElement('span');
    nm.className = 'gf-name';
    nm.textContent = T('しまってあるウィジェット: ') + hidden + T(' 個');
    const btn = document.createElement('button');
    btn.className = 'btn primary';
    btn.textContent = T('すべて出す');
    btn.onclick = async () => {
      await window.api.showAllWidgets();
      cfg = await baseConfig();
      renderWidgetList();
    };
    row.append(nm, btn);
    list.appendChild(row);
  }

  // 数が増えると探しづらいので、名前や種類で絞り込めるようにする
  if (cfg.widgets.length >= 6) {
    const row = document.createElement('div');
    row.className = 'row wf-row';
    const lab = document.createElement('label');
    lab.textContent = T('絞り込み');
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.id = 'widget-filter';
    inp.placeholder = T('名前や種類で探す');
    inp.value = widgetQuery;
    inp.addEventListener('input', () => {
      touch();                       // 入力中に onConfig で一覧を作り直されないように
      widgetQuery = inp.value;
      applyWidgetFilter();
    });
    const ctl = document.createElement('div');
    ctl.className = 'ctl';
    ctl.appendChild(inp);
    row.append(lab, ctl);
    list.appendChild(row);
  } else {
    widgetQuery = '';
  }

  for (const w of cfg.widgets) list.appendChild(widgetCard(w));
  applyWidgetFilter();
}

// 絞り込みは表示の出し入れだけで行う (作り直すと入力欄からフォーカスが外れる)
function applyWidgetFilter() {
  const q = widgetQuery.trim().toLowerCase();
  const cards = new Map([...document.querySelectorAll('#widget-list .widget-card')]
    .map(el => [el.dataset.wid, el]));
  let hit = 0;
  for (const w of cfg.widgets) {
    const card = cards.get(w.id);
    if (!card) continue;
    const meta = TYPES[w.type] || { label: w.type };
    const hay = `${w.name || ''} ${T(meta.label)} ${w.type}`.toLowerCase();
    const show = !q || hay.includes(q);
    card.style.display = show ? '' : 'none';
    if (show) hit++;
  }
  const none = $('#widget-none');
  if (none) none.remove();
  if (q && !hit) {
    const p = document.createElement('p');
    p.className = 'hint';
    p.id = 'widget-none';
    p.textContent = T('見つかりませんでした');
    $('#widget-list').appendChild(p);
  }
}

// ---------------------------------------------------------------- テーマ / ウィザード
let themesCache = [];

function themeCard(theme, onApplied) {
  const card = document.createElement('div');
  card.className = 'theme-card';
  const pv = document.createElement('div');
  card.appendChild(pv);
  const meta = document.createElement('div');
  meta.className = 'theme-meta';
  const name = document.createElement('div');
  name.className = 'theme-name';
  name.textContent = uiLang() === 'en' ? (theme.nameEn || theme.name) : theme.name;
  const desc = document.createElement('div');
  desc.className = 'theme-desc';
  desc.textContent = uiLang() === 'en' ? (theme.descEn || theme.desc) : theme.desc;
  meta.appendChild(name);
  meta.appendChild(desc);
  card.appendChild(meta);
  card.addEventListener('click', async () => {
    touch();
    await window.api.applyTheme(theme.id);
    cfg = await baseConfig();
    renderWallpaperTab();
    renderWidgetList();
    renderLayouts();
    if (onApplied) onApplied();
  });
  // DOM に載ってから描く (clientWidth が必要)
  requestAnimationFrame(() => renderMiniPreview(pv, theme.wallpapers, theme.widgets, 0));
  return card;
}

async function renderThemes() {
  if (!themesCache.length) themesCache = await window.api.listThemes();
  const grid = $('#theme-grid');
  grid.innerHTML = '';
  for (const t of themesCache) grid.appendChild(themeCard(t));
}

async function maybeShowWizard() {
  if (cfg.settings.onboarded) return;
  if (!themesCache.length) themesCache = await window.api.listThemes();
  const wiz = $('#wizard');
  const grid = $('#wizard-themes');
  grid.innerHTML = '';
  const close = () => {
    wiz.style.display = 'none';
    touch();
    cfg.settings.onboarded = true;
    window.api.setSettings({ onboarded: true });
  };
  for (const t of themesCache) grid.appendChild(themeCard(t, close));
  $('#wizard-skip').onclick = close;
  wiz.style.display = 'grid';
}

// ---------------------------------------------------------------- 一般タブ
async function renderGeneral() {
  const a = await window.api.getAutostart();
  const chk = $('#autostart');
  chk.checked = a.enabled;
  chk.disabled = !a.supported;
  $('#autostart-note').textContent = a.supported
    ? 'サインイン時に壁紙が自動で表示されます (設定画面は開きません)。'
    : '開発モードでは変更できません。ビルド版 (exe) で有効になります。';
  chk.onchange = async () => {
    const r = await window.api.setAutostart(chk.checked);
    chk.checked = r.enabled;
  };

  const pfs = $('#pause-fs');
  pfs.checked = cfg.settings.pauseOnFullscreen !== false;
  pfs.onchange = () => { touch(); window.api.setSettings({ pauseOnFullscreen: pfs.checked }); };

  const pre = $('#allow-prerelease');
  if (pre) {
    pre.checked = !!cfg.settings.allowPrerelease;
  }
  renderBackups();

  // デスクトップ
  const si = $('#show-icons');
  si.checked = cfg.settings.showDesktopIcons !== false;
  si.onchange = () => { touch(); window.api.setSettings({ showDesktopIcons: si.checked }); };

  const lang = $('#lang-sel');
  lang.value = cfg.settings.language || 'auto';
  lang.onchange = () => {
    touch();
    cfg.settings.language = lang.value;
    window.api.setSettings({ language: lang.value });
    // 動的に組み立てた UI も含めて全体を作り直す
    applyI18n();
    renderAddRow();
    renderWallpaperTab();
    renderWidgetList();
    renderGeneral();
    renderThemes();
  };

  // ホットキー
  const hk = cfg.settings.hotkeys || {};
  $('#hk-on').checked = !!hk.enabled;
  $('#hk-on').onchange = (e) => pushHotkeys({ enabled: e.target.checked });
  for (const name of ['overlay', 'toggleWidgets', 'toggleIcons', 'nextLayout', 'pomoToggle']) {
    const inp = $('#hk-' + name);
    if (document.activeElement !== inp) inp.value = hk[name] || '';
    inp.onchange = async () => {
      pushHotkeys({ [name]: inp.value.trim() });
      // 登録は main 側で行われるので、少し待ってから結果を見る
      setTimeout(markFailedHotkeys, 250);
    };
  }
  markFailedHotkeys();

  // 呼び出せるダッシュボード
  const ov = cfg.settings.overlay || {};
  const pushOverlay = (patch) => {
    touch();
    cfg.settings.overlay = Object.assign(
      { dim: 55, hideIcons: true, allDisplays: false, closeOnBlur: true },
      cfg.settings.overlay || {}, patch,
    );
    window.api.setSettings({ overlay: cfg.settings.overlay });
  };
  const ovDim = $('#ov-dim');
  ovDim.value = String(ov.dim != null ? ov.dim : 55);
  $('#ov-dim-val').textContent = ovDim.value + '%';
  ovDim.oninput = () => { $('#ov-dim-val').textContent = ovDim.value + '%'; };
  ovDim.onchange = () => pushOverlay({ dim: +ovDim.value });
  const ovIcons = $('#ov-icons');
  ovIcons.checked = ov.hideIcons !== false;
  ovIcons.onchange = () => pushOverlay({ hideIcons: ovIcons.checked });
  const ovAll = $('#ov-all');
  ovAll.checked = !!ov.allDisplays;
  ovAll.onchange = () => pushOverlay({ allDisplays: ovAll.checked });
  const ovBlur = $('#ov-blur');
  ovBlur.checked = ov.closeOnBlur !== false;
  ovBlur.onchange = () => pushOverlay({ closeOnBlur: ovBlur.checked });

  renderSchedule();
  renderLayouts();   // 中で renderScenes() も呼ばれる
  updateStatusText(await window.api.getUpdateStatus());

  const sel = $('#weather-interval');
  sel.value = String(cfg.settings.weatherIntervalMin || 30);
  sel.onchange = () => { touch(); window.api.setSettings({ weatherIntervalMin: +sel.value }); };

  $('#btn-weather-refresh').onclick = async () => {
    $('#weather-status').textContent = '更新中…';
    await window.api.refreshWeather();
  };

  updateWeatherStatus(await window.api.getWeather());
  renderGfList();
  $('#version').textContent = 'v' + await window.api.getVersion();
}

// 他のアプリに取られているキーは、黙って効かないままだと理由が分からない。
// 入力欄を赤くして、その場で伝える。
async function markFailedHotkeys() {
  let failed = [];
  try { failed = await window.api.failedHotkeys(); } catch (_) { return; }
  const note = $('#hk-failed-note');
  for (const name of ['overlay', 'toggleWidgets', 'toggleIcons', 'nextLayout', 'pomoToggle']) {
    const inp = $('#hk-' + name);
    if (!inp) continue;
    inp.classList.toggle('bad', failed.includes(name));
  }
  if (note) {
    note.style.display = failed.length ? '' : 'none';
    note.textContent = T('赤くなっているキーは、他のアプリがすでに使っているため登録できませんでした。別のキーに変えてください。');
  }
}

function pushHotkeys(patch) {
  touch();
  const hk = Object.assign(
    { enabled: false, overlay: 'Ctrl+Alt+A', toggleWidgets: 'Ctrl+Alt+W', toggleIcons: 'Ctrl+Alt+D', nextLayout: 'Ctrl+Alt+L', pomoToggle: 'Ctrl+Alt+P' },
    cfg.settings.hotkeys || {},
    patch,
  );
  cfg.settings.hotkeys = hk;
  window.api.setSettings({ hotkeys: hk });
}

// ---- 壁紙スケジュール ----
const WEEK_LABELS = ['日', '月', '火', '水', '木', '金', '土'];
let schedDay = new Date().getDay();  // 曜日モードで選択中の曜日

function schedState() {
  return Object.assign(
    { enabled: false, mode: 'daynight', dayStart: '07:00', nightStart: '19:00', day: null, night: null, weekly: {} },
    cfg.settings.schedule || {},
  );
}

function pushSched(patch) {
  touch();
  const s = Object.assign(schedState(), patch);
  cfg.settings.schedule = s;
  window.api.setSettings({ schedule: s });
  renderSchedule();
}

function paintSwatch(el, wp) {
  el.style.background = wp ? wpCss(wp) : 'transparent';
  el.title = wp
    ? (wp.type === 'image' || wp.type === 'video' ? String(wp.value).split(/[\\/]/).pop() : '登録済み')
    : '未登録 (壁紙タブで設定してから登録してください)';
}

function renderSchedule() {
  const s = schedState();
  $('#sched-on').checked = !!s.enabled;
  $$('#sched-mode-seg button').forEach(b => b.classList.toggle('on', b.dataset.v === (s.mode || 'daynight')));
  const weekly = s.mode === 'weekly';
  $$('.sched-daynight').forEach(el => { el.style.display = weekly ? 'none' : 'flex'; });
  $$('.sched-weekly').forEach(el => { el.style.display = weekly ? 'flex' : 'none'; });

  if (document.activeElement !== $('#sched-day')) $('#sched-day').value = s.dayStart;
  if (document.activeElement !== $('#sched-night')) $('#sched-night').value = s.nightStart;
  paintSwatch($('#sched-day-prev'), s.day);
  paintSwatch($('#sched-night-prev'), s.night);

  const chips = $('#sched-week-chips');
  chips.innerHTML = '';
  WEEK_LABELS.forEach((lb, i) => {
    const c = document.createElement('button');
    c.className = 'chip' + (schedDay === i ? ' active' : '');
    c.textContent = lb + ((s.weekly || {})[String(i)] ? ' ●' : '');
    c.addEventListener('click', () => { schedDay = i; renderSchedule(); });
    chips.appendChild(c);
  });
  $('#sched-week-sel-label').textContent = `選択中: ${WEEK_LABELS[schedDay]}曜日`;
  paintSwatch($('#sched-week-prev'), (s.weekly || {})[String(schedDay)]);
}

$('#sched-on').addEventListener('change', (e) => pushSched({ enabled: e.target.checked }));
$$('#sched-mode-seg button').forEach(b => b.addEventListener('click', () => pushSched({ mode: b.dataset.v })));
$('#sched-day').addEventListener('change', (e) => pushSched({ dayStart: e.target.value || '07:00' }));
$('#sched-night').addEventListener('change', (e) => pushSched({ nightStart: e.target.value || '19:00' }));
$('#sched-set-day').addEventListener('click', () => pushSched({ day: clone(cfg.wallpapers.default) }));
$('#sched-set-night').addEventListener('click', () => pushSched({ night: clone(cfg.wallpapers.default) }));
$('#sched-week-set').addEventListener('click', () => {
  const weekly = { ...(schedState().weekly || {}) };
  weekly[String(schedDay)] = clone(cfg.wallpapers.default);
  pushSched({ weekly });
});
$('#sched-week-clear').addEventListener('click', () => {
  const weekly = { ...(schedState().weekly || {}) };
  delete weekly[String(schedDay)];
  pushSched({ weekly });
});

// ---- レイアウトプリセット (モードへ統合済み。呼び出し互換のため空で残す) ----
function renderLayouts() {
  return;
  // 以下は旧実装 (到達しない)
  const list = $('#layout-list');
  list.innerHTML = '';
  const layouts = cfg.settings.layouts || [];
  for (const [i, l] of layouts.entries()) {
    const row = document.createElement('div');
    row.className = 'gf-item';
    const name = document.createElement('span');
    name.className = 'gf-name';
    name.textContent = l.name;
    const meta = document.createElement('span');
    meta.className = 'note';
    meta.style.padding = '0';
    meta.textContent = `ウィジェット ${(l.widgets || []).length} 個`;
    const apply = document.createElement('button');
    apply.className = 'btn';
    apply.textContent = '適用';
    apply.addEventListener('click', async () => {
      touch();
      await window.api.applyLayout(i);
      cfg = await baseConfig();
      renderWallpaperTab();
      renderWidgetList();
      renderLayouts();
    });
    const over = document.createElement('button');
    over.className = 'btn';
    over.textContent = '上書き';
    over.title = '現在の構成でこのプリセットを上書き';
    over.addEventListener('click', async () => {
      touch();
      cfg.settings.layouts = await window.api.overwriteLayout(i);
      renderLayouts();
    });
    row.appendChild(name);
    row.appendChild(meta);
    row.appendChild(apply);
    row.appendChild(over);
    row.appendChild(mkDelBtn(async () => {
      touch();
      cfg.settings.layouts = await window.api.removeLayout(i);
      renderLayouts();
    }));
    list.appendChild(row);
  }
  renderScenes();   // シーンのレイアウト選択肢も追従させる
}

// 設定がどこかで変わったとき、アイコンのページを開いていれば追従する。
// ただし編集中 (touch 直後) と連続変更中は巻き込まない:
// 保存のたびに全体を作り直すと、その最中のクリックが食われて
// 「上書きが不安定」に見えるため。
let icFollowTimer = null;
function followIconTab() {
  const active = document.querySelector('#tab-icons.active');
  if (!active) return;
  clearTimeout(icFollowTimer);
  const tick = () => {
    // 編集中 (touch 直後) なら、その手が止まるまで待ってから 1 回だけ読む
    const wait = suppressUntil - Date.now();
    if (wait > 0) { icFollowTimer = setTimeout(tick, wait + 100); return; }
    renderIconLayouts();
  };
  icFollowTimer = setTimeout(tick, 400);
}

// ---- シーン (状況でレイアウトを自動切替) ----
const SCN_TRIGGERS = [
  ['app', 'アプリが前面のとき'],
  ['fullscreen', 'フルスクリーン中'],
  ['time', '時間帯'],
  ['battery', 'バッテリー駆動中'],
];

function scenesCfg() {
  if (!cfg.settings.scenes) cfg.settings.scenes = { enabled: false, wallpaperOnly: true, defaultLayout: '', rules: [] };
  if (!Array.isArray(cfg.settings.scenes.rules)) cfg.settings.scenes.rules = [];
  return cfg.settings.scenes;
}

function pushScenes() {
  touch();
  window.api.setSettings({ scenes: JSON.parse(JSON.stringify(scenesCfg())) });
}

// シーンで切り替えるアイコン配置。'' = アイコンには触らない
function scnIconSelect(value, onChange) {
  const sel = document.createElement('select');
  const snaps = cfg.settings.iconLayouts || [];
  const empty = document.createElement('option');
  empty.value = '';
  empty.textContent = T('(アイコンは触らない)');
  sel.appendChild(empty);
  for (const l of snaps) {
    if (l.name === '復元前 (自動)') continue;      // 自動退避は選ばせない
    const o = document.createElement('option');
    o.value = l.name;
    o.textContent = l.name;
    sel.appendChild(o);
  }
  sel.value = snaps.some(l => l.name === value) ? value : '';
  sel.onchange = () => onChange(sel.value);
  return sel;
}

function scnLayoutSelect(value, onChange) {
  const sel = document.createElement('select');
  const layouts = cfg.settings.layouts || [];
  const empty = document.createElement('option');
  empty.value = '';
  empty.textContent = T('(レイアウトを選ぶ)');
  sel.appendChild(empty);
  for (const l of layouts) {
    const o = document.createElement('option');
    o.value = l.name;
    o.textContent = l.name;
    sel.appendChild(o);
  }
  sel.value = layouts.some(l => l.name === value) ? value : '';
  sel.onchange = () => onChange(sel.value);
  return sel;
}

function renderScenes() {
  // シーンはモードへ統合済み。タブの中身は index.html の案内だけ
  return;
  // 以下は旧実装 (到達しない)
  const sc = scenesCfg();
  const on = $('#scn-on');
  if (!on) return;
  on.checked = !!sc.enabled;
  on.onchange = () => { sc.enabled = on.checked; pushScenes(); };

  // 通常時レイアウト (select を作り直して id を引き継ぐ)
  const oldSel = $('#scn-default');
  const defSel = scnLayoutSelect(sc.defaultLayout, (v) => { sc.defaultLayout = v; pushScenes(); });
  defSel.id = 'scn-default';
  defSel.style.minWidth = '220px';
  oldSel.replaceWith(defSel);

  // 壁紙だけにするか、ウィジェットまで入れ替えるか
  const woBox = $('#scn-wallpaper-only');
  if (woBox) {
    woBox.innerHTML = '';
    woBox.appendChild(mkCheck('壁紙だけ切り替える (ウィジェットはそのまま)',
      sc.wallpaperOnly !== false,
      (v) => { sc.wallpaperOnly = v; pushScenes(); renderScenes(); }));
    const note = document.createElement('p');
    note.className = 'foot-note';
    note.textContent = sc.wallpaperOnly !== false
      ? T('切り替わるのは背景だけです。ウィジェットは置いたまま残ります。')
      : T('レイアウトごと入れ替えます。そのレイアウトを保存したあとに足したウィジェットは、切り替えた瞬間に画面から消えます (設定には残ります)。');
    note.style.color = sc.wallpaperOnly !== false ? '' : '#ffb27a';
    woBox.appendChild(note);
  }

  const list = $('#scn-rules');
  list.innerHTML = '';
  sc.rules.forEach((rule, i) => list.appendChild(scnRuleCard(rule, i)));

  $('#scn-add').onclick = () => {
    sc.rules.push({
      id: 'r' + Date.now().toString(36),
      name: '', enabled: true,
      trigger: { type: 'app', apps: [] },
      layout: '',
    });
    pushScenes();
    renderScenes();
  };
}

function scnRuleCard(rule, i) {
  const sc = scenesCfg();
  const card = document.createElement('div');
  card.className = 'scn-rule';

  // 1 行目: 有効 / 名前 / トリガー種別 / 優先度 / 削除
  const head = document.createElement('div');
  head.className = 'scn-row';

  const en = document.createElement('label');
  en.className = 'switch';
  en.innerHTML = '<input type="checkbox"><span class="knob"></span>';
  const enInput = en.querySelector('input');
  enInput.checked = rule.enabled !== false;
  enInput.onchange = () => { rule.enabled = enInput.checked; pushScenes(); };

  const name = document.createElement('input');
  name.type = 'text';
  name.placeholder = T('ルール名 (例: ゲーム中)');
  name.value = rule.name || '';
  name.style.width = '150px';
  name.onchange = () => { rule.name = name.value.trim(); pushScenes(); };

  const trig = document.createElement('select');
  for (const pair of SCN_TRIGGERS) {
    const o = document.createElement('option');
    o.value = pair[0];
    o.textContent = T(pair[1]);
    trig.appendChild(o);
  }
  trig.value = (rule.trigger && rule.trigger.type) || 'app';
  trig.onchange = () => {
    const t = trig.value;
    rule.trigger = t === 'app' ? { type: 'app', apps: [] }
      : t === 'time' ? { type: 'time', days: [1, 2, 3, 4, 5], from: '09:00', to: '18:00' }
      : { type: t };
    pushScenes();
    renderScenes();
  };

  const up = document.createElement('button');
  up.className = 'btn';
  up.textContent = String.fromCharCode(0x2191);
  up.title = T('優先度を上げる (上のルールが勝ちます)');
  up.disabled = i === 0;
  up.onclick = () => {
    sc.rules.splice(i - 1, 0, sc.rules.splice(i, 1)[0]);
    pushScenes();
    renderScenes();
  };

  const del = document.createElement('button');
  del.className = 'btn';
  del.textContent = String.fromCharCode(0x2715);
  del.title = T('削除');
  del.onclick = () => { sc.rules.splice(i, 1); pushScenes(); renderScenes(); };

  head.append(en, name, trig, up, del);
  card.appendChild(head);

  // 2 行目: トリガーごとの詳細
  const t = rule.trigger || {};
  if (t.type === 'app') {
    const row = document.createElement('div');
    row.className = 'scn-row';
    const apps = document.createElement('input');
    apps.type = 'text';
    apps.placeholder = 'game.exe, photoshop.exe';
    apps.value = (t.apps || []).join(', ');
    apps.style.flex = '1';
    apps.onchange = () => {
      t.apps = apps.value.split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
      pushScenes();
    };
    const pick = document.createElement('button');
    pick.className = 'btn';
    pick.textContent = T('前面のアプリを取得');
    pick.onclick = async () => {
      pick.disabled = true;
      const old = pick.textContent;
      pick.textContent = T('対象のアプリをクリックしてください…');
      const exe = await window.api.captureForegroundApp();
      pick.textContent = old;
      pick.disabled = false;
      if (!exe) {
        $('#scn-status').textContent = T('アプリを取得できませんでした (ボタンを押してから 6 秒以内に対象のウィンドウをクリックしてください)');
        return;
      }
      $('#scn-status').textContent = '';
      const cur = new Set(t.apps || []);
      cur.add(exe);
      t.apps = [...cur];
      pushScenes();
      renderScenes();
    };
    row.append(apps, pick);
    card.appendChild(row);
  } else if (t.type === 'time') {
    const row = document.createElement('div');
    row.className = 'scn-row';
    const chips = document.createElement('div');
    chips.className = 'chips';
    WEEK_LABELS.forEach((lb, d) => {
      const days = Array.isArray(t.days) ? t.days : [];
      const c = document.createElement('button');
      c.className = 'chip' + (days.includes(d) ? ' active' : '');
      c.textContent = lb;
      c.onclick = () => {
        const set = new Set(Array.isArray(t.days) ? t.days : []);
        if (set.has(d)) set.delete(d); else set.add(d);
        t.days = [...set].sort();
        pushScenes();
        renderScenes();
      };
      chips.appendChild(c);
    });
    const from = document.createElement('input');
    from.type = 'time';
    from.value = t.from || '09:00';
    from.onchange = () => { t.from = from.value; pushScenes(); };
    const dash = document.createElement('span');
    dash.className = 'dim';
    dash.textContent = String.fromCharCode(0x2013);
    const to = document.createElement('input');
    to.type = 'time';
    to.value = t.to || '18:00';
    to.onchange = () => { t.to = to.value; pushScenes(); };
    row.append(chips, from, dash, to);
    card.appendChild(row);
  }

  // 3 行目: 切替先レイアウト
  const dest = document.createElement('div');
  dest.className = 'scn-row';
  const arrow = document.createElement('span');
  arrow.className = 'dim';
  arrow.textContent = T('→ このレイアウトへ');
  const sel = scnLayoutSelect(rule.layout, (v) => { rule.layout = v; pushScenes(); });
  dest.append(arrow, sel);
  card.appendChild(dest);

  // アイコン配置 (任意)
  const iconRow = document.createElement('div');
  iconRow.className = 'scn-row';
  const iconLab = document.createElement('span');
  iconLab.className = 'dim';
  iconLab.textContent = T('→ アイコンは');
  iconRow.append(iconLab, scnIconSelect(rule.icons, (v) => { rule.icons = v; pushScenes(); }));
  card.appendChild(iconRow);

  return card;
}

// ---- デスクトップアイコンの保存 / 復元 ----
// デスクトップの見取り図に実際の配置を描き、
// 隠したいアイコンは右の枠へドラッグして振り分ける。
// アイコンを「どのモニタにあるか」で仕分けて並べ、隠したいものは右の枠へドラッグする。
//
// 実座標のまま縮小すると、アイコン間隔 127px が 13px ほどになって名前が重なる
// (実測)。位置を正確に写すより名前が読めることを優先し、モニタごとの区画の中で
// 元の並び順のままグリッドに整列させる。
// モードごとに「どのアイコンを隠すか」「どのウィジェットを出すか」をチェックで決める。
// 各モードは折りたたみ、開くとデスクトップの全アイコンが名前と絵つきで並ぶ。
const icOpenModes = new Set();      // 開いているモード名
const icDraft = new Map();          // モード名 -> Set(隠すアイコン名)     未保存の編集
const icWDraft = new Map();         // モード名 -> {link, on:Set(widgetId)} 未保存の編集
let icImgCache = new Map();         // アイコン名 -> dataURL | null
let icAlias = {};                   // アイコン名 -> 画面に出す呼び名

async function iconImageFor(name) {
  if (icImgCache.has(name)) return icImgCache.get(name);
  let url = null;
  try { url = await window.api.iconImage(name); } catch (_) { url = null; }
  icImgCache.set(name, url);
  return url;
}

const CHECK_SVG = '<svg class="mark" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 12.5l5 5L19.5 7"/></svg>';

function widgetLabel(w) {
  const meta = TYPES[w.type] || { label: w.type };
  const disp = displays.length > 1 ? ' ・ ' + T('モニタ') + ((w.display || 0) + 1) : '';
  return (w.name || T(meta.label)) + disp;
}

function mkLabelSpan(text) {
  const el = document.createElement('span');
  el.className = 'ic-inline-label';
  el.textContent = T(text);
  return el;
}

function mkSubHead(text, right) {
  const h = document.createElement('div');
  h.className = 'ic-sub-head';
  const a = document.createElement('span');
  a.textContent = text;
  const b = document.createElement('span');
  b.className = 'ic-sub-meta';
  b.textContent = right || '';
  h.append(a, b);
  return h;
}

function mkNote(text) {
  const el = document.createElement('p');
  el.className = 'foot-note';
  el.textContent = text;
  return el;
}

// アイコン 1 行 (クリックで隠す / 鉛筆で呼び名を付ける)。
// クリックは行のクラスだけ切り替え、onToggle で数の表示を更新する。
// 一覧を作り直すとスクロールが飛んで上から降ってくるように見えるため。
function icItem(name, hideSet, onToggle) {
  const row = document.createElement('div');
  row.className = 'ic-item' + (hideSet.has(name) ? ' hidden-on' : '');
  row.title = name;

  const ph = document.createElement('span');
  ph.className = 'ph';
  row.appendChild(ph);
  iconImageFor(name).then((url) => {
    if (!url) return;
    const img = document.createElement('img');
    img.src = url;
    img.alt = '';
    ph.replaceWith(img);
  });

  const label = document.createElement('span');
  label.className = 'nm' + (icAlias[name] ? ' aliased' : '');
  label.textContent = icAlias[name] || name;
  row.appendChild(label);

  // 呼び名を付ける。デスクトップの実際の名前は変えない
  // (変えてしまうと、その名前で覚えている保存済みモードが全部迷子になる)
  const pen = document.createElement('button');
  pen.className = 'ic-edit';
  pen.title = T('呼び名を付ける (デスクトップの名前は変わりません)');
  pen.innerHTML = PEN_SVG;
  pen.onclick = (e) => {
    e.stopPropagation();
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.className = 'ic-alias-in';
    inp.value = icAlias[name] || '';
    inp.placeholder = name;
    inp.maxLength = 40;
    let done = false;
    const save = async () => {
      if (done) return;
      done = true;
      const r = await window.api.setIconAlias(name, inp.value);
      if (r && r.ok) {
        if (r.label) icAlias[name] = r.label; else delete icAlias[name];
      }
      renderIconPicker();
    };
    inp.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') save();
      if (ev.key === 'Escape') { done = true; renderIconPicker(); }
    });
    inp.addEventListener('blur', save);
    inp.addEventListener('click', (ev) => ev.stopPropagation());
    label.replaceWith(inp);
    inp.focus();
    inp.select();
  };
  row.appendChild(pen);
  row.insertAdjacentHTML('beforeend', CHECK_SVG);

  row.onclick = () => {
    touch();                       // 編集中は外からの作り直しを待たせる
    if (hideSet.has(name)) hideSet.delete(name); else hideSet.add(name);
    row.classList.toggle('hidden-on', hideSet.has(name));
    if (onToggle) onToggle();
  };
  return row;
}

// 1 モードぶんのカード
function icModeCard(snap, allNames) {
  const open = icOpenModes.has(snap.name);
  const hideSet = icDraft.get(snap.name)
    || new Set(Array.isArray(snap.hidden) ? snap.hidden : []);
  icDraft.set(snap.name, hideSet);

  const wd = icWDraft.get(snap.name)
    || { link: !!snap.linkWidgets, on: new Set(snap.widgetsOn || []) };
  icWDraft.set(snap.name, wd);

  const allWidgets = cfg.widgets || [];
  // 消えたショートカットが hidden に残っていても数に混ぜない
  const hideNow = () => allNames.filter(n => hideSet.has(n)).length;
  const wOn = () => allWidgets.filter(w => wd.on.has(w.id)).length;

  const card = document.createElement('div');
  card.className = 'ic-mode' + (open ? ' open' : '');
  card.dataset.mode = snap.name;

  const head = document.createElement('div');
  head.className = 'ic-mode-head';
  head.innerHTML = '<svg class="ic-mode-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>';
  const nm = document.createElement('span');
  nm.className = 'ic-mode-name';
  nm.textContent = snap.name;
  head.append(nm);
  if (activeModeNames.includes(snap.name)) {
    const live = document.createElement('span');
    live.className = 'ic-now';
    live.textContent = T('効いています');
    head.appendChild(live);
    card.classList.add('is-now');
  }
  if (snap.name === (cfg.settings || {}).currentIconMode) {
    const now = document.createElement('span');
    now.className = 'ic-now';
    now.textContent = T('いま適用中');
    head.appendChild(now);
    card.classList.add('is-now');
  }
  const meta = document.createElement('span');
  meta.className = 'ic-mode-meta';
  // 数の表示はチェックのたびに書き直す (一覧そのものは作り直さない)
  let iconsSubMeta = null;
  let widgetsSubMeta = null;
  let updateCounts = () => {
    const h = hideNow();
    meta.textContent = T('全部で ') + allNames.length + T(' 個') + ' ・ '
      + T('隠す ') + h + T(' 個') + ' ・ '
      + T('見えるのは ') + (allNames.length - h) + T(' 個')
      + (wd.link ? ' ・ ' + T('ウィジェット ') + wOn() + '/' + allWidgets.length : '');
    if (iconsSubMeta) iconsSubMeta.textContent = T('隠す ') + h + ' / ' + allNames.length;
    if (widgetsSubMeta) {
      widgetsSubMeta.textContent = !wd.link ? T('連動しません')
        : (wOn() ? T('出す ') + wOn() + ' / ' + allWidgets.length : T('ひとつも選んでいません'));
    }
  };
  updateCounts();
  head.append(meta);
  head.onclick = () => {
    if (open) icOpenModes.delete(snap.name); else icOpenModes.add(snap.name);
    renderIconPicker();
  };

  // 見出しをつまんで並び替えられる
  head.draggable = true;
  head.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/ww-mode', snap.name);
    e.dataTransfer.effectAllowed = 'move';
    card.classList.add('dragging');
  });
  head.addEventListener('dragend', () => card.classList.remove('dragging'));
  card.addEventListener('dragover', (e) => {
    if (![...e.dataTransfer.types].includes('text/ww-mode')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const r = card.getBoundingClientRect();
    const before = e.clientY < r.top + r.height / 2;
    card.classList.toggle('drop-before', before);
    card.classList.toggle('drop-after', !before);
  });
  card.addEventListener('dragleave', (e) => {
    // dragleave は子要素をまたぐたびに飛んでくる。カードの外へ出たときだけ消す
    if (e.relatedTarget && card.contains(e.relatedTarget)) return;
    card.classList.remove('drop-before', 'drop-after');
  });
  card.addEventListener('drop', async (e) => {
    const from = e.dataTransfer.getData('text/ww-mode');
    if (!from) return;
    e.preventDefault();
    // クラスの残り香ではなく、落とした瞬間のカーソル位置で上下を決める
    const rc = card.getBoundingClientRect();
    const before = e.clientY < rc.top + rc.height / 2;
    card.classList.remove('drop-before', 'drop-after');
    if (from === snap.name) return;
    const order = [...document.querySelectorAll('#ic-modes .ic-mode')].map(el => el.dataset.mode).filter(Boolean);
    const cut = order.indexOf(from);
    if (cut < 0) return;
    order.splice(cut, 1);
    let at = order.indexOf(snap.name);
    if (!before) at++;
    order.splice(at, 0, from);
    const r = await safeCall(window.api.reorderIconModes(order), { ok: false });
    if (!r || !r.ok) icStatus(T('並び替えを保存できませんでした'));
    renderIconPicker();
  });
  card.appendChild(head);

  if (!open) return card;

  const body = document.createElement('div');
  body.className = 'ic-mode-body';

  const mkBtn = (label, fn, cls) => {
    const b = document.createElement('button');
    b.className = 'btn' + (cls ? ' ' + cls : '');
    b.textContent = T(label);
    b.onclick = (ev) => fn(ev);
    return b;
  };

  // 名前は作ってから付け直せる
  const nameRow = document.createElement('div');
  nameRow.className = 'ic-mode-tools';
  const nameIn = document.createElement('input');
  nameIn.type = 'text';
  nameIn.value = snap.name;
  nameIn.style.flex = '1';
  nameIn.maxLength = 40;
  const doRename = async () => {
    const to = nameIn.value.trim();
    if (!to || to === snap.name) return;
    const r = await window.api.renameIconMode(snap.name, to);
    if (!r.ok) { $('#ic-status').textContent = r.msg; nameIn.value = snap.name; return; }
    // 編集中の下書きも新しい名前へ引っ越す
    if (icDraft.has(snap.name)) { icDraft.set(r.name, icDraft.get(snap.name)); icDraft.delete(snap.name); }
    if (icWDraft.has(snap.name)) { icWDraft.set(r.name, icWDraft.get(snap.name)); icWDraft.delete(snap.name); }
    if (icOpenModes.delete(snap.name)) icOpenModes.add(r.name);
    $('#ic-status').textContent = T('名前を変えました');
    cfg = await baseConfig();
    renderIconLayouts();
  };
  nameIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') doRename(); });
  nameRow.append(mkLabelSpan('モードの名前'), nameIn, mkBtn('名前を変える', doRename));
  body.appendChild(nameRow);

  // --- 重ね (このモードが効いている間だけ、上に乗るもの) ---
  body.appendChild(mkSubHead(T('重ね'), snap.hasWallpaper ? T('壁紙を覚えています') : T('壁紙は覚えていません')));

  // 状態はひとつだけ選ぶ: オフ / 常に効かせる / 条件で効かせる。
  // 以前は「今すぐ効かせる」と「条件」を同時に立てられ、手動オンが常に勝つため
  // 条件を変えても何も起きなかった。選択肢を 1 本にして矛盾を作れなくする
  const trg = snap.trigger || null;
  const stateNow = trg ? 'auto' : (snap.on ? 'always' : 'off');
  const trRow = document.createElement('div');
  trRow.className = 'ic-mode-tools';
  trRow.appendChild(mkLabelSpan('このモードの動作'));
  const setTrigger = async (t) => {
    // ここは type を変えない値の書き換えだけ (アプリ名・時刻)。表示は入力欄の値が
    // そのまま正しいので、全体を作り直す必要はない — 作り直すとフォーカス中の
    // 隣の欄 (from -> to へタブ移動して入力中など)を壊して打鍵を飲み込んでしまう。
    // touch() で、この後の config 配信による自動再描画も少し待たせる
    touch();
    await window.api.setIconTrigger(snap.name, t);
  };
  trRow.appendChild(mkSelect(
    [['off', 'オフ'], ['always', '常に効かせる'],
     ['app', '条件: アプリが前面のとき'], ['fullscreen', '条件: 全画面のアプリがあるとき'],
     ['battery', '条件: バッテリー駆動のとき'], ['time', '条件: 時間帯']],
    stateNow === 'auto' ? trg.type : stateNow,
    async (v) => {
      touch();   // この直後に自分で再描画するので、配信経由の二重再描画は待たせる
      if (v === 'off') { await window.api.setIconTrigger(snap.name, null); await window.api.setIconModeOn(snap.name, false); }
      else if (v === 'always') {
        await window.api.setIconTrigger(snap.name, null);
        const r = await window.api.setIconModeOn(snap.name, true);
        // 排他は黙って裏でやらない。オフになったものを名指しで知らせる
        if (r && r.turnedOff && r.turnedOff.length) {
          toast(T('「{a}」をオンにしたので「{b}」をオフにしました').replace('{a}', snap.name).replace('{b}', r.turnedOff.join('」「')));
        }
      }
      else {
        await window.api.setIconModeOn(snap.name, false);
        if (v === 'app') await window.api.setIconTrigger(snap.name, { type: 'app', apps: (trg && trg.apps) || [] });
        else if (v === 'time') await window.api.setIconTrigger(snap.name, { type: 'time', from: (trg && trg.from) || '22:00', to: (trg && trg.to) || '06:00' });
        else await window.api.setIconTrigger(snap.name, { type: v });
      }
      renderIconLayouts();
    }));
  trRow.appendChild(mkCheck('壁紙も覚える', !!snap.hasWallpaper, async (v) => {
    touch();
    const r = await window.api.setIconWallpaper(snap.name, v);
    icStatus(r.ok ? (v ? T('いまの壁紙を覚えました') : T('壁紙を忘れました')) : r.msg);
    renderIconLayouts();
  }));
  body.appendChild(trRow);

  if (trg && trg.type === 'app') {
    const appRow = document.createElement('div');
    appRow.className = 'ic-mode-tools';
    appRow.appendChild(mkLabelSpan('アプリ名'));
    appRow.appendChild(mkText((trg.apps || []).join(', '), 'chrome.exe, valorant.exe',
      (v) => setTrigger({ type: 'app', apps: v.split(',').map(x => x.trim()).filter(Boolean) })));
    body.appendChild(appRow);
    body.appendChild(mkNote(T('前面のアプリの実行ファイル名です。タスクマネージャーの「詳細」タブで確認できます。')));
  }
  if (trg && trg.type === 'time') {
    const tRow = document.createElement('div');
    tRow.className = 'ic-mode-tools';
    tRow.appendChild(mkLabelSpan('時間帯'));
    const from = mkText(trg.from || '22:00', '22:00', (v) => setTrigger({ ...trg, from: v.trim() }));
    const to = mkText(trg.to || '06:00', '06:00', (v) => setTrigger({ ...trg, to: v.trim() }));
    from.style.width = '80px'; from.style.flex = 'none';
    to.style.width = '80px'; to.style.flex = 'none';
    tRow.append(from, mkLabelSpan('〜'), to);
    body.appendChild(tRow);
  }

  body.appendChild(mkNote(T('効いている間だけ、覚えたものが上に重なります。条件から外れると自動で元へ戻ります。設定そのものは書き換わりません。')));

  const tools = document.createElement('div');
  tools.className = 'ic-mode-tools';
  const setAllRows = (on) => {
    for (const el of card.querySelectorAll('.ic-item:not(.w-item)')) {
      el.classList.toggle('hidden-on', on);
    }
    updateCounts();
  };
  tools.append(
    mkBtn('すべて表示', () => { hideSet.clear(); setAllRows(false); }),
    mkBtn('すべて隠す', () => { for (const n of allNames) hideSet.add(n); setAllRows(true); }),
  );
  const grow = document.createElement('span');
  grow.className = 'grow';
  tools.appendChild(grow);
  tools.append(
    mkBtn('この内容で保存', async (ev) => {
      const btn = ev.currentTarget;
      if (btn.disabled) return;
      btn.disabled = true;
      touch();                                   // 保存の通知で画面を作り直させない
      try {
        // 位置は触らずチェックと連動だけ、1 回の書き込みで更新する
        const r = await window.api.updateIconMode(snap.name,
          { hidden: [...hideSet], linkWidgets: wd.link, widgetsOn: [...wd.on] });
        if (!r.ok) { icStatus(r.msg); return; }
        icStatus(T('保存しました') + ' ・ ' + T('隠す ') + r.hidden + T(' 個')
          + (wd.link ? ' ・ ' + T('ウィジェット ') + wd.on.size : ''));
        // 下書きは捨てない (保存内容と同じものが入っている)。
        // ここで捨てて作り直すと、その一瞬のクリックが消える
      } catch (err) {
        icStatus(T('保存できませんでした: ') + ((err && err.message) || err));
      } finally {
        btn.disabled = false;
      }
    }),
    mkBtn('このモードを適用', async () => {
      const r = await window.api.restoreIcons(snap.name);
      if (!r.ok) { icStatus(r.msg); return; }
      let m = T('適用しました');
      if (r.hidden) m += ' ・ ' + T('隠した: ') + r.hidden + T(' 個');
      if (r.rescued) m += ' ・ ' + T('画面に無い保存位置だった {n} 個は前の場所へ').replace('{n}', r.rescued);
      if (r.celled) m += ' ・ ' + T('行き先の分からない {n} 個は空きへ').replace('{n}', r.celled);
      if (r.widgets) m += ' ・ ' + T('ウィジェット ') + r.widgets;
      if (r.widgetsRestored) m += ' ・ ' + T('しまってあった ') + r.widgetsRestored + T(' 個を出しました');
      icStatus(m);
      cfg = await baseConfig();
      renderWidgetList();
      renderIconLayouts();
    }),
    // 並べ直したあとに、今のデスクトップの位置でこのモードを更新する
    mkBtn('今の並びを覚え直す', async (ev) => {
      const btn = ev.currentTarget;
      if (btn.disabled) return;
      // 別のモードが当たっているなら、その並びで上書きしていいか確かめる
      const curMode = (cfg.settings || {}).currentIconMode || '';
      if (curMode && curMode !== snap.name) {
        if (!confirm(T('いま適用中は「') + curMode + T('」です。「') + snap.name
          + T('」の並びを、今のデスクトップの並びで上書きします。よろしいですか?'))) return;
      }
      btn.disabled = true;
      touch();
      try {
        const r = await window.api.saveIcons(snap.name, [...hideSet]);
        icStatus(r.ok ? T('今の並びを覚えました (') + r.count + T(' 個)') : r.msg);
      } catch (err) {
        icStatus(T('保存できませんでした: ') + ((err && err.message) || err));
      } finally {
        btn.disabled = false;
      }
    }),
    mkBtn('削除', async () => {
      if (!confirm(T('このモードを削除します: ') + snap.name)) return;
      await window.api.removeIconSnapshot(snap.name);
      icOpenModes.delete(snap.name);
      icDraft.delete(snap.name);
      icWDraft.delete(snap.name);
      renderIconLayouts();
    }, 'danger'),
  );
  body.appendChild(tools);

  // --- デスクトップアイコン (適用ボタンで実際に動かす。重ねとは別) ---
  const iconsSub = mkSubHead(T('デスクトップのアイコン'), '');
  iconsSubMeta = iconsSub.querySelector('.ic-sub-meta');
  body.appendChild(iconsSub);
  const list = document.createElement('div');
  list.className = 'ic-list';
  for (const name of allNames) list.appendChild(icItem(name, hideSet, updateCounts));
  body.appendChild(list);

  // --- ウィジェット ---
  const widgetsSub = mkSubHead(T('ウィジェット'), '');
  widgetsSubMeta = widgetsSub.querySelector('.ic-sub-meta');
  body.appendChild(widgetsSub);
  updateCounts();

  const linkRow = document.createElement('div');
  linkRow.className = 'ic-mode-tools';
  linkRow.appendChild(mkCheck('このモードでウィジェットも切り替える', wd.link, (v) => {
    wd.link = v;
    // 初めてオンにしたら「いま出ているもの」を初期値にする。
    // ひとつも出ていないときは全部を初期値にする (空のまま保存すると何も出なくなる)
    if (v && !wd.on.size) {
      const vis = allWidgets.filter(w => !w.off);
      for (const w of (vis.length ? vis : allWidgets)) wd.on.add(w.id);
    }
    renderIconPicker();
  }));
  body.appendChild(linkRow);

  let noteNone = null;     // 「ひとつも選んでいない」の知らせ
  let noteSwitcher = null; // 「切り替えボタンをしまうと戻れない」の知らせ
  if (wd.link) {
    if (!allWidgets.length) {
      body.appendChild(mkNote(T('ウィジェットがまだありません。')));
    } else {
      const setAllW = (on) => {
        for (const el of card.querySelectorAll('.ic-item.w-item')) el.classList.toggle('on', on);
        updateCounts();
      };
      const wtools = document.createElement('div');
      wtools.className = 'ic-mode-tools';
      wtools.append(
        mkBtn('すべて出す', () => { for (const w of allWidgets) wd.on.add(w.id); setAllW(true); }),
        mkBtn('すべてしまう', () => { wd.on.clear(); setAllW(false); }),
      );
      body.appendChild(wtools);

      const wlist = document.createElement('div');
      wlist.className = 'ic-list';
      for (const w of allWidgets) {
        const row = document.createElement('div');
        // ウィジェットは「出す」側にチェックが付く (アイコンとは逆の意味)
        row.className = 'ic-item w-item' + (wd.on.has(w.id) ? ' on' : '');
        const ph = document.createElement('span');
        ph.className = 'ph glyph';
        ph.appendChild(svgIcon((TYPES[w.type] || { icon: 'i-widgets' }).icon));
        const label = document.createElement('span');
        label.className = 'nm';
        label.textContent = widgetLabel(w);
        row.append(ph, label);
        row.insertAdjacentHTML('beforeend', CHECK_SVG);
        row.onclick = () => {
          touch();
          if (wd.on.has(w.id)) wd.on.delete(w.id); else wd.on.add(w.id);
          row.classList.toggle('on', wd.on.has(w.id));
          updateCounts();
        };
        wlist.appendChild(row);
      }
      body.appendChild(wlist);
      // どちらの知らせもチェックのたびに出し入れする (作った時点の状態で固定しない)
      noteNone = mkNote(T('ひとつも選んでいないので、このモードが効いている間はウィジェットが全部隠れます。'));
      noteSwitcher = mkNote(T('切り替えボタンをしまうと、そのモードからは押せなくなります (設定画面からは戻せます)。'));
      body.append(noteNone, noteSwitcher);
    }
  }

  const baseUpdateCounts = updateCounts;
  updateCounts = () => {
    baseUpdateCounts();
    if (noteNone) noteNone.style.display = wOn() ? 'none' : '';
    if (noteSwitcher) {
      const hidesSwitcher = wOn() > 0 && allWidgets.some(w =>
        (w.type === 'switcher' || w.type === 'modeswitch') && !wd.on.has(w.id));
      noteSwitcher.style.display = hidesSwitcher ? '' : 'none';
    }
  };
  updateCounts();

  card.appendChild(body);
  return card;
}

async function renderIconPicker(snapshots) {
  const wrap = $('#ic-modes');
  if (!wrap) return;

  // 作り直すとスクロールが上へ飛ぶので、位置を控えて戻す
  const sc = document.getElementById('content');
  const keepScroll = sc ? sc.scrollTop : 0;

  const [names, res, alias] = await Promise.all([
    safeCall(window.api.iconNames(), []),
    snapshots ? Promise.resolve(snapshots) : safeCall(window.api.iconSnapshots(), { saved: [] }),
    safeCall(window.api.iconAliases(), {}),
  ]);
  const snaps = (res && res.saved) || [];
  icAlias = alias || {};

  wrap.innerHTML = '';
  if (!names.length) {
    wrap.appendChild(mkNote(T('デスクトップアイコンにアクセスできません')));
    return;
  }
  if (!snaps.length) {
    wrap.appendChild(mkNote(T('まだモードがありません。下で名前を付けて作成してください。')));
    return;
  }
  for (const snap of snaps) wrap.appendChild(icModeCard(snap, names));
  if (sc) sc.scrollTop = keepScroll;
}


// IPC が 1 つ失敗しただけでページ全体 (ボタンの配線を含む) が
// 止まらないように、既定値つきで包んで並列に取る
function safeCall(promise, fallback) {
  return Promise.resolve(promise).then(v => v, () => fallback);
}

async function renderIconLayouts() {
  const wrap = $('#ic-list');
  if (!wrap) return;

  const [avail, stranded, aa, parked, cap, res] = await Promise.all([
    safeCall(window.api.iconsAvailable(), false),
    safeCall(window.api.strandedIcons(), []),
    safeCall(window.api.iconAutoArrange(), null),
    safeCall(window.api.parkedWidgets(), 0),
    safeCall(window.api.iconCapacity(), 0),
    safeCall(window.api.iconSnapshots(), { saved: [], auto: null }),
  ]);

  const cnt = $('#ic-count');
  if (cnt) {
    cnt.textContent = avail
      ? '' : T('デスクトップアイコンにアクセスできません');
  }

  // 画面外に取り残されているアイコンがあれば目立たせる
  const sEl = $('#ic-stranded');
  const box = $('#ic-rescue-box');
  if (sEl) {
    sEl.textContent = stranded.length
      ? stranded.length + T(' 個') + ' ・ ' + stranded.slice(0, 4).join(', ') + (stranded.length > 4 ? ' …' : '')
      : T('ありません');
  }
  if (box) box.style.borderColor = stranded.length ? 'var(--acc)' : '';
  const showAllBtn = $('#ic-showall');
  if (showAllBtn) {
    showAllBtn.disabled = !stranded.length;
    showAllBtn.onclick = async () => {
      const r = await window.api.showAllIcons();
      if (!r.ok) { $('#ic-status').textContent = r.msg; }
      else {
        let m = T('元の位置に戻しました (') + (r.restored || 0) + T(' 個)');
        if (r.placed) m += T(' / 元の位置が分からず並べ直した: ') + r.placed + T(' 個');
        $('#ic-status').textContent = m;
      }
      renderIconLayouts();
    };
  }

  // デスクトップの「自動整列」がオンだと、隠しても Windows が並べ直してしまう
  const aaEl = $('#ic-autoarrange');
  if (aaEl) aaEl.style.display = aa ? '' : 'none';

  // ウィジェットがしまわれていたら、このページからも戻せるようにする
  const parkedBox = $('#ic-parked');
  if (parkedBox) {
    parkedBox.innerHTML = '';
    parkedBox.style.display = parked ? '' : 'none';
    if (parked) {
      const nm = document.createElement('span');
      nm.className = 'gf-name';
      nm.textContent = T('しまってあるウィジェット: ') + parked + T(' 個');
      const btn = document.createElement('button');
      btn.className = 'btn primary';
      btn.textContent = T('すべて出す');
      btn.onclick = async () => {
        await window.api.showAllWidgets();
        cfg = await baseConfig();
        renderWidgetList();
        renderIconLayouts();
      };
      parkedBox.append(nm, btn);
    }
  }

  // 隠せるか (死角の数) を正直に伝える
  const capEl = $('#ic-cap');
  if (capEl) {
    capEl.textContent = cap > 0
      ? T('画面のすき間へ最大 ') + cap + T(' 個まで隠せます。隠したアイコンは削除されません。')
      : T('この画面構成では隠す場所がありません (モニタが画面いっぱいのため)。フォルダウィジェットで必要なものだけ並べる方法をおすすめします。');
    capEl.style.color = cap > 0 ? '' : '#ffb27a';
  }
  const snaps = res.saved || [];
  const auto = res.auto || null;
  wrap.innerHTML = '';

  // 自動退避は一覧に混ぜず、控えめな 1 行として最後に置く
  if (auto) {
    const row = document.createElement('div');
    row.className = 'gf-item';
    row.style.opacity = '.72';
    const nm = document.createElement('span');
    nm.className = 'note';
    nm.style.padding = '0';
    nm.style.flex = '1';
    nm.textContent = T('直前の状態を自動で控えてあります') + ' ・ ' + new Date(auto.savedAt).toLocaleString('ja-JP');
    const undo = document.createElement('button');
    undo.className = 'btn';
    undo.textContent = T('元に戻す');
    undo.title = T('いま行った復元や切り替えを取り消します');
    undo.onclick = async () => {
      const r = await window.api.restoreIcons(auto.name);
      $('#ic-status').textContent = r.ok ? T('元に戻しました') : r.msg;
      renderIconLayouts();
    };
    row.append(nm, undo);
    wrap.appendChild(row);
  }

  // 自動復元の選択 (「(なし)」= オフ)
  const autoSel = $('#ic-auto');
  autoSel.innerHTML = '';
  const off = document.createElement('option');
  off.value = '';
  off.textContent = T('(なし = オフ)');
  autoSel.appendChild(off);
  for (const snap of snaps) {
    const o = document.createElement('option');
    o.value = snap.name;
    o.textContent = snap.name;
    autoSel.appendChild(o);
  }
  autoSel.value = cfg.settings.iconAutoRestore || '';
  autoSel.onchange = () => {
    touch();
    cfg.settings.iconAutoRestore = autoSel.value;
    window.api.setSettings({ iconAutoRestore: autoSel.value });
  };

  // モード一覧は最後に描く。ここで転んでも上の操作は生きたままにする
  try {
    await renderIconPicker(res);
  } catch (err) {
    icStatus(T('モード一覧を表示できませんでした: ') + (err && err.message));
  }
}

// 作成まわりは「一度だけ・描画の成否と無関係に」配線する。
// 以前は renderIconLayouts の途中 (6 個の await の後) で配線していたため、
// 手前のどれかが一度でも失敗するとボタンがハンドラ無しのまま永久に無反応だった。
async function createIconMode() {
  const nameEl = $('#ic-name');
  try {
    const name = nameEl.value.trim();
    if (!name) { icStatus(T('名前を入れてください')); return; }
    // 既にある名前なら黙って上書きしない。saveIcons は元々「同じ名前なら上書き」の
    // 保存も兼ねているため (覚え直すボタンが使う)、ここで作成側だけ止める
    if ((cfg.settings.iconLayouts || []).some(l => l.name === name)) {
      icStatus(T('その名前のモードは既にあります。開いて「今の並びを覚え直す」を使ってください。'));
      icOpenModes.add(name);
      renderIconLayouts();
      return;
    }
    // 作った直後は何も隠していない状態。開いてチェックを入れて保存する
    const r = await window.api.saveIcons(name, []);
    if (!r.ok) { icStatus(r.msg); return; }
    icStatus(T('作成しました。開いて隠すアイコンを選んでください。'));
    nameEl.value = '';
    icDraft.delete(r.name);           // 同名事故がなくても、念のため古い下書きは残さない
    icWDraft.delete(r.name);
    icOpenModes.add(r.name);          // 作ったら開いた状態で出す
    renderIconLayouts();
  } catch (err) {
    icStatus(T('作成できませんでした: ') + ((err && err.message) || err));
  }
}
$('#ic-save').addEventListener('click', createIconMode);
$('#ic-name').addEventListener('keydown', (e) => { if (e.key === 'Enter') createIconMode(); });

// 結果の知らせは #ic-status (ページ下部) と、どこにいても見えるトーストの両方に出す
function icStatus(text) {
  const el = $('#ic-status');
  if (el) el.textContent = text;
  toast(text);
}


// ---- バックアップ ----
$('#btn-export').addEventListener('click', async () => {
  const r = await window.api.exportConfig();
  $('#backup-status').textContent = r.msg;
});
$('#btn-import').addEventListener('click', async () => {
  const r = await window.api.importConfig();
  $('#backup-status').textContent = r.msg;
  if (r.ok) {
    cfg = await baseConfig();
    renderWallpaperTab();
    renderWidgetList();
    renderGeneral();
  }
});

// ---- アップデート / 修復 / アンインストール ----
function updateStatusText(s) {
  const t = $('#update-status-text');
  const install = $('#btn-update-install');
  const get = $('#btn-update-download');
  install.style.display = s.state === 'ready' ? '' : 'none';
  get.style.display = s.state === 'confirm' ? '' : 'none';
  switch (s.state) {
    case 'confirm': t.textContent = `${T('先行版')} v${s.version} ${T('があります')} — ${T('開発版のため不具合が残っている場合があります')}`; break;
    case 'checking': t.textContent = '確認中…'; break;
    case 'available': t.textContent = `v${s.version} をダウンロード中…`; break;
    case 'downloading': t.textContent = `v${s.version || ''} をダウンロード中 ${s.message || ''}`; break;
    case 'ready': t.textContent = `v${s.version} の準備ができました`; break;
    case 'latest': t.textContent = '最新版です'; break;
    case 'portable': t.textContent = 'ポータブル版は手動更新です (Releases から最新版をダウンロード)'; break;
    case 'dev': t.textContent = '開発モードでは無効'; break;
    case 'error':
      // 公開直後などの一時的な失敗は、待てば直ると伝える
      t.textContent = s.message === 'transient'
        ? T('いま確認できませんでした。公開の直後かもしれません。少し待ってからもう一度お試しください。')
        : `${T('確認できませんでした')}${s.message ? ' (' + s.message + ')' : ''}`;
      break;
    default: t.textContent = '未確認';
  }

  // 更新すると何が変わるのかを見せる (判断できないまま再起動を迫らない)
  const notes = $('#update-notes');
  if (notes) {
    const show = s.notes && ['confirm', 'available', 'downloading', 'ready'].includes(s.state);
    notes.style.display = show ? '' : 'none';
    notes.textContent = show ? s.notes : '';
  }
}

$('#btn-update-check').addEventListener('click', async () => {
  updateStatusText(await window.api.checkUpdate());
});
$('#btn-update-install').addEventListener('click', () => window.api.installUpdate());
$('#btn-update-download').addEventListener('click', () => {
  window.api.downloadUpdate();
  $('#btn-update-download').style.display = 'none';
});

// 先行版を受け取るか
$('#allow-prerelease').addEventListener('change', async (e) => {
  touch();
  await window.api.setSettings({ allowPrerelease: e.target.checked });
  updateStatusText(await window.api.checkUpdate());
});

// ---- 自動バックアップ ----
function backupWhen(ms) {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

async function renderBackups() {
  const list = $('#backup-list');
  if (!list) return;
  const items = await window.api.listBackups();
  list.innerHTML = '';
  if (!items.length) {
    const empty = document.createElement('p');
    empty.className = 'foot-note';
    empty.textContent = T('まだバックアップはありません。次にバージョンが変わったときに作られます。');
    list.appendChild(empty);
    return;
  }
  for (const b of items) {
    const row = document.createElement('div');
    row.className = 'gf-item';

    const name = document.createElement('span');
    name.className = 'gf-name';
    name.textContent = backupWhen(b.time);

    const meta = document.createElement('span');
    meta.className = 'note';
    meta.style.padding = '0';
    meta.textContent = b.reason || (b.version ? `v${b.version}` : '');

    const restore = document.createElement('button');
    restore.className = 'btn';
    restore.textContent = T('復元');
    restore.addEventListener('click', async () => {
      const r = await window.api.restoreBackup(b.file);
      $('#backup-status').textContent = r.msg;
      if (r.ok) {
        cfg = await baseConfig();
        renderWallpaperTab();
        renderWidgetList();
        renderGeneral();
      }
      renderBackups();
    });

    const del = document.createElement('button');
    del.className = 'btn';
    del.textContent = T('削除');
    del.addEventListener('click', async () => {
      const r = await window.api.removeBackup(b.file);
      if (!r.ok) $('#backup-status').textContent = r.msg;
      renderBackups();
    });

    row.append(name, meta, restore, del);
    list.appendChild(row);
  }
}

$('#btn-backup-reveal').addEventListener('click', () => window.api.revealBackups());
window.api.onUpdateStatus((s) => updateStatusText(s));

$('#btn-repair').addEventListener('click', async () => {
  $('#repair-note').textContent = '再適用中…';
  await window.api.repair();
  $('#repair-note').textContent = '壁紙を貼り付け直しました。';
});

$('#btn-uninstall').addEventListener('click', async () => {
  const r = await window.api.uninstall();
  if (!r.ok && r.msg) $('#uninstall-note').textContent = r.msg;
});

function updateWeatherStatus(w) {
  const el = $('#weather-status');
  if (!w) { el.textContent = '天気ウィジェットを追加すると自動で取得します。'; return; }
  if (w.error || w.temp == null) { el.textContent = '取得に失敗しました。ネットワークを確認してください。'; return; }
  const t = new Date(w.fetchedAt);
  el.textContent = `最終更新 ${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')} ・ ${w.city} ${w.temp}° ${w.desc}`;
}

// ---- Google Fonts ----
function renderGfList() {
  const list = $('#gf-list');
  list.innerHTML = '';
  for (const f of (cfg.settings.googleFonts || [])) {
    const row = document.createElement('div');
    row.className = 'gf-item';
    const name = document.createElement('span');
    name.className = 'gf-name';
    name.style.fontFamily = `'${f.family}'`;
    name.textContent = f.family;
    row.appendChild(name);
    row.appendChild(mkDelBtn(async () => {
      touch();
      await window.api.removeGoogleFont(f.family);
      cfg.settings.googleFonts = cfg.settings.googleFonts.filter(x => x.family !== f.family);
      renderGfList();
    }));
    list.appendChild(row);
  }
}

$('#gf-add').addEventListener('click', async () => {
  const inp = $('#gf-input');
  const status = $('#gf-status');
  const name = inp.value.trim();
  if (!name) return;
  status.textContent = `「${name}」をダウンロード中…`;
  $('#gf-add').disabled = true;
  const r = await window.api.addGoogleFont(name);
  $('#gf-add').disabled = false;
  if (r.ok) {
    status.textContent = `「${r.family}」を追加しました。フォント選択で G バッジ付きで表示されます。`;
    inp.value = '';
    cfg = await baseConfig();
    renderGfList();
  } else {
    status.textContent = `追加できませんでした: ${r.msg}`;
  }
});
$('#gf-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#gf-add').click(); });

async function injectFonts() {
  try {
    $('#gfonts').textContent = await window.api.getFontsCss();
  } catch (_) {}
}

// ---------------------------------------------------------------- フォント一覧
let fontsLoaded = false;
async function loadFonts() {
  if (fontsLoaded) return;
  let names = [];
  try {
    if (window.queryLocalFonts) {
      const fonts = await window.queryLocalFonts();
      names = [...new Set(fonts.map(f => f.family))];
    }
  } catch (_) { /* 権限やジェスチャ要件で失敗したらフォールバック */ }
  if (!names.length) names = FALLBACK_FONTS.slice();
  else fontsLoaded = true;
  names.sort((a, b) => a.localeCompare(b, 'ja'));
  systemFonts = names;
}

// ---------------------------------------------------------------- 読み直し (F5)
// デスクトップにアイコンを足した / ウィジェットを外で変えた、といったときに
// 開き直さずに取り直せるようにする。ページの再読み込みではないのでタブは保つ。
let refreshing = false;
async function refreshAll() {
  if (refreshing) return;
  refreshing = true;
  try {
    icImgCache = new Map();          // アイコン画像は取り直す
    icDraft.clear();                 // 未保存のチェックも捨てる (読み直しの約束どおり)
    icWDraft.clear();
    try { await window.api.flushIconImages(); } catch (_) {}   // main 側の画像キャッシュも
    const env = await window.api.getConfig();
    cfg = env.base || env.config;   // 設定画面は土台を編集する
    if (Array.isArray(env.activeModes)) activeModeNames = env.activeModes;
    sysWall = env.systemWallpaper || '';
    if (env.osLocale) osLocale = env.osLocale;
    displays = await window.api.listDisplays();
    // ここも 1 か所ずつ隔離する。読み直しの途中で転ぶと、下書きだけ捨てて
    // 描き直しは半分で止まる — 画面は生きているのに中身が古い、いちばん困る状態になる
    safeRender('wallpaper', () => renderWallpaperTab());
    safeRender('widgets', () => renderWidgetList());
    await safeRenderAsync('general', () => renderGeneral());
    await safeRenderAsync('icons', () => renderIconLayouts());
    safeRender('fonts', () => injectFonts());
    toast(T('読み直しました'));
  } finally {
    refreshing = false;
  }
}

let toastTimer = null;
function toast(text) {
  let el = $('#toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1600);
}

document.addEventListener('keydown', (e) => {
  const r = e.key === 'F5' || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'r');
  if (!r) return;
  e.preventDefault();
  refreshAll();
});

// ---------------------------------------------------------------- 初期化・購読
window.api.onConfig((env) => {
  cfg = env.base || env.config;   // 設定画面は土台を編集する
  if (Array.isArray(env.activeModes)) activeModeNames = env.activeModes;
  sysWall = env.systemWallpaper || '';
  if (env.osLocale) osLocale = env.osLocale;
  if (env.brand) BRAND = env.brand;
  safeRender('wallpaper', () => renderWallpaperTab());
  safeRender('general', () => renderGeneral());
  if (Date.now() > suppressUntil) safeRender('widgets', () => renderWidgetList());
  safeRender('icons', () => followIconTab());
});

window.api.onWeather((w) => updateWeatherStatus(w));
window.api.onLhmStatus((v) => { lhmOnline = v; });
window.api.onFontsChanged(() => injectFonts());

(async () => {
  const env = await window.api.getConfig();
  cfg = env.base || env.config;   // 設定画面は土台を編集する
  if (Array.isArray(env.activeModes)) activeModeNames = env.activeModes;
  sysWall = env.systemWallpaper || '';
  if (env.osLocale) osLocale = env.osLocale;
  if (env.brand) BRAND = env.brand;
  displays = await window.api.listDisplays();
  try {
    const hw = await window.api.getHw();
    lhmOnline = !!hw.lhmOnline;
  } catch (_) {}
  if (cfg.wallpapers.default.type === 'custom' && cfg.wallpapers.default.value) {
    Object.assign(cb, clone(cfg.wallpapers.default.value));
  }
  applyI18n();
  safeRender('add-row', () => renderAddRow());
  safeRender('wallpaper', () => renderWallpaperTab());
  safeRender('custom', () => renderCustomBuilder());
  safeRender('widgets', () => renderWidgetList());
  safeRender('general', () => renderGeneral());
  safeRender('fonts', () => injectFonts());
  safeRender('fonts-list', () => loadFonts());
  document.addEventListener('pointerdown', () => loadFonts(), { once: true });

  // 開発用: ?tab=widgets などで初期タブを指定
  const t = new URLSearchParams(location.search).get('tab');
  if (t) {
    const btn = document.querySelector(`.nav-item[data-tab="${t}"]`);
    if (btn) btn.click();
  }

  maybeShowWizard();
})();
