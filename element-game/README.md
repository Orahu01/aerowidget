# 元素当てゲーム (Element Guessing Game)

周期表の118元素から出題される、Wordle風の元素当てクイズです。ビルド不要の素の HTML / CSS / JavaScript のみで動作します。

- **今日の元素**: 日付から自動で決まる、毎日共通のお題に挑戦するモード
- **ランダムモード**: 好きなだけ遊べる練習モード
- 原子番号・周期・族・ブロック(s/p/d/f)・分類・常温での状態のヒントを頼りに、最大8回で当てます
- 数値項目は近い/遠いと上下の矢印で絞り込みをサポート
- 結果は絵文字グリッドとしてクリップボードにコピーしてシェア可能
- 連続正解数などの統計はブラウザの localStorage に保存されます(サーバー不要)

## ローカルで確認する

ビルドステップはありません。任意の静的サーバーで配信するだけです。

```bash
npx http-server element-game -p 8080
# → http://localhost:8080 を開く
```

## Cloudflare Pages にデプロイする

このリポジトリには他の無関係なプロジェクト(AeroWidget本体)も含まれているため、Cloudflare Pages のプロジェクト設定で **ルートディレクトリをこのフォルダに限定** してください。

1. Cloudflare ダッシュボード → **Workers & Pages** → **Pages** → **Create a project** → **Connect to Git**
2. このリポジトリ (`Orahu01/aerowidget`) を選択
3. デプロイ設定:
   - **Production branch**: `main`(または公開したいブランチ)
   - **Framework preset**: `None`
   - **Build command**: (空欄のまま)
   - **Build output directory**: `element-game`
4. **Save and Deploy** を実行

デプロイ後は `xxxx.pages.dev` のURLが発行されます。独自ドメインを使う場合は Pages プロジェクトの **Custom domains** タブから追加してください。
