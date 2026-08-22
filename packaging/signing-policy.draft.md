# コード署名ポリシー (下書き)

SignPath Foundation の申請が **承認されてから** docs/signing.html として公開すること。
承認前に公開すると「署名済み」という事実でない記載が公開サイトに載るため、まだ出さない。

申請時に必要な項目 (SignPath Foundation の Code of Conduct より):

- OSI 承認ライセンス / 商用デュアルライセンスでないこと → **MIT** (LICENSE, GitHub も MIT と認識)
- 継続的に開発されていること → 33 リリース、直近も更新中
- リリース済みの形で配布していること → GitHub Releases (インストーラ / ポータブル)
- 機能の説明があること → https://orahu01.github.io/aerowidget/ と GitHub Wiki
- チームの役割 (Authors / Reviewers / Approvers) を明示すること
- 全員が MFA (二要素認証) を有効にしていること → **要対応**
- コード署名ポリシーを自分のサイトに公開すること → この文書
- 自分のソースからビルドした成果物にだけ署名すること → GitHub Actions でタグからビルド
- ファイルのメタデータ (製品名・バージョン・発行者) を一貫させること → 5.9.21 で Orahu01 に統一済み

---

## 以下、公開用の本文案

### コード署名について

AeroWidget の配布ファイル (インストーラおよびポータブル版) は、
**SignPath.io の無償コード署名**によって署名されています。証明書は
**SignPath Foundation** が発行しています。

> Free code signing provided by [SignPath.io](https://signpath.io/),
> certificate by [SignPath Foundation](https://signpath.org/)

これにより、ダウンロードしたファイルが AeroWidget の作者によって作られ、
配布の途中で書き換えられていないことを Windows が確認できます。

### 体制

このプロジェクトは個人開発です。以下の役割はすべて同一人物が担っています。

| 役割 | 担当 | 内容 |
|---|---|---|
| Author | Orahu01 ([GitHub](https://github.com/Orahu01)) | ソースコードを書き、変更を取り込む |
| Reviewer | Orahu01 | 外部からの変更 (Pull Request) を確認する |
| Approver | Orahu01 | リリースと署名を承認する |

GitHub アカウントでは二要素認証を有効にしています。SignPath についても同様です。

### ビルドの流れ

リリースは手作業ではなく、**GitHub Actions** の中だけで行われます。

1. `vX.Y.Z` の形式でタグを打つ
2. GitHub Actions がそのタグのソースからインストーラをビルドする
   (ワークフローは [.github/workflows/release.yml](https://github.com/Orahu01/aerowidget/blob/main/.github/workflows/release.yml))
3. 成果物を SignPath へ送り、署名されたものを受け取る
4. GitHub Releases へ公開する

署名の対象は、この公開リポジトリのソースからビルドしたファイルだけです。
第三者のライブラリを同梱している場合、それらは元の配布元の署名のまま
(または未署名のまま) 同梱され、こちらで署名し直すことはしません。

### プライバシー

AeroWidget は、利用状況の収集や送信を一切行いません。
ネットワーク通信が発生するのは、次の場合だけです。いずれもユーザーの操作で始まります。

| 通信先 | いつ | 何のため |
|---|---|---|
| GitHub | 更新を確認したとき | 新しいバージョンの有無とダウンロード |
| Open-Meteo | 天気ウィジェットを置いたとき | 指定した地点の天気 |
| Google Fonts | フォントを追加したとき | 選んだフォントの取得 |
| 指定した RSS / カレンダー (ICS) の配信元 | それらのウィジェットを置いたとき | 記事や予定の取得 |
| 指定した株価銘柄の配信元 | 株価ウィジェットを置いたとき | 価格の取得 |
| ユーザーが登録したリンク先 | フォルダウィジェットにリンクを追加したとき | そのサイトのアイコン (favicon) の取得 |
| ユーザーが選んだ壁紙の配信元 | オンライン壁紙を選んだとき | 画像の取得 |

設定やアイコンの配置は、すべて自分の PC の中
(`%APPDATA%\AeroWidget\config.json`) にだけ保存されます。

### 連絡先

不具合や質問は [GitHub Issues](https://github.com/Orahu01/aerowidget/issues) へ。
