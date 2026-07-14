// 日本語翻訳
const ja = {
  // ヘッダー
  "header.title": "THERMAL GUIDE",
  "header.guest": "ゲスト（ログイン/登録）",
  "header.guest_short": "ゲスト",
  "header.guest_feedback": "仮フィードバック有効",
  "header.login_short": "ログイン",
  "header.logout": "ログアウト",
  "header.profile": "個人化プリセット",

  // 体スペックカード
  "body.title": "個人体型設定",
  "body.height": "身長 (cm)",
  "body.weight": "体重 (kg)",
  "body.fat": "体脂肪率 (%)",
  "body.gender": "性別",
  "body.male": "男性 [ MALE ]",
  "body.female": "女性 [ FEMALE ]",
  "body.env": "活動環境",
  "body.indoor": "🏠 室内空調 (HVAC)",
  "body.outdoor": "🌀 屋外自然風 (Outdoor)",
  "body.analyze": "分析結果を更新する",
  "body.analyzing": "分析を更新中...",
  "body.summary_height": "身長",
  "body.summary_weight": "体重",
  "body.summary_fat": "体脂肪率",

  // 時間帯スライダー
  "time.title": "時間帯別体感分析",
  "time.current": "(現在)",
  "time.desc": "*時間の流れに伴う外部気象状況および気流変化をマッピングし、リアルタイム体感温度を追跡します。",

  // 温熱プロファイル
  "thermal.title": "リアルタイム熱負荷分析",
  "thermal.loading": "PMV計算中...",
  "thermal.empty": "分析ボタンを押して結果を確認してください。",
  "thermal.status_label": "体感温熱グレード",
  "thermal.pmv_label": "PMV指数",
  "thermal.feedback_q": "この服装の体感はいかがですか？",
  "thermal.too_hot": "🥵 暑い",
  "thermal.good": "😊 ちょうどいい",
  "thermal.too_cold": "🥶 寒い",
  "thermal.pmv_desc": "*PMV（Predicted Mean Vote）：ISO 7730温熱快適性指標。単純な気温を超え、あなたの代謝量と発汗能力を反映した温度負荷指数です。",

  // 位置情報
  "location.title": "現在地情報",
  "location.sido": "広域市・道",
  "location.sigungu": "市・郡・区",
  "location.map_desc": "選択した地域のリアルタイム気象データに基づいてPMVを計算します。",

  // 天気ウィジェット
  "weather.title": "リアルタイム気象観測情報",
  "weather.temp": "気温",
  "weather.humidity": "湿度",
  "weather.wind": "風速",

  // AI ガイダンス
  "ai.title": "リアルタイムAIカスタムソリューション",
  "ai.powered": "Powered by Gemini Pro",
  "ai.summary_title": "💡 総合体型・気流体感サマリー",
  "ai.clothing": "着衣ガイド",
  "ai.hydration": "水分摂取ガイド",
  "ai.activity": "行動・屋外活動ガイド",
  "ai.loading": "分析中...",
  "ai.empty": "分析ボタンを押してください。",
  "ai.reset": "デフォルト設定にリセット",
  "ai.feedback_applied": "[個人化フィードバック補正適用済み: Bias = ",
  "ai.clo_final": ", 最終CLO = ",

  // 共有
  "share.copy": "リンクをコピー",
  "share.save": "画像を保存",
  "share.copied": "リンクをクリップボードにコピーしました！",
  "share.copy_fail": "リンクのコピーに失敗しました。",

  // 類似推薦
  "similar.title": "類似体型スペック推薦ガイド",
  "similar.badge": "人体工学マッチ",
  "similar.empty": "分析後に類似スペック推薦が表示されます。",

  // 体脂肪ガイド
  "bodyfat.guide_title": "体脂肪率ビジュアルガイド (BODY FAT GUIDE)",
  "bodyfat.guide_desc": "自分の体型に近いスロットを選択すると、体脂肪率が自動入力されます。",
  "bodyfat.male": "男性体型 (MALE)",
  "bodyfat.female": "女性体型 (FEMALE)",
  "bodyfat.apply": "この値を適用",
  "bodyfat.close": "閉じる",
  "bodyfat.athlete_title_m": "🥇 アスリート型 (10 ~ 12%)",
  "bodyfat.athlete_desc_m": "体脂肪が極めて低く、筋肉の輪郭や血管がくっきりと浮かび上がった体型。",
  "bodyfat.fit_title_m": "🏋️ フィット/ウェルビーイング型 (13 ~ 17%)",
  "bodyfat.fit_desc_m": "腹筋がうっすら見え、全体的に引き締まった健康的な体型。",
  "bodyfat.normal_title_m": "🏃 普通/一般型 (18 ~ 22%)",
  "bodyfat.normal_desc_m": "肥満ではなく、特別なトレーニング痕跡はないがバランスの取れた標準的な体型。",
  "bodyfat.overweight_title_m": "🐷 軽度肥満型 (25% 以上)",
  "bodyfat.overweight_desc_m": "腰周りやお腹周りに脂肪がつき、ボディラインが丸みを帯びた柔らかい体型。",
  "bodyfat.athlete_title_f": "🥇 アスリート型 (18 ~ 20%)",
  "bodyfat.athlete_desc_f": "脂肪が最小限に抑えられ、腹直筋の溝と体のシルエットが引き締まった体型。",
  "bodyfat.fit_title_f": "🏋️ フィット/ウェルビーイング型 (21 ~ 24%)",
  "bodyfat.fit_desc_f": "太ももや腕などに適度な筋肉のハリがあり、ウエストラインがスリムな体型。",
  "bodyfat.normal_title_f": "🏃 普通/一般型 (25 ~ 31%)",
  "bodyfat.normal_desc_f": "自然な屈曲があり、女性基準で最も一般的かつバランスの取れた標準体型。",
  "bodyfat.overweight_title_f": "🐷 軽度肥満型 (32% 以上)",
  "bodyfat.overweight_desc_f": "お尻やお腹下側の皮下脂肪蓄積が目立ち、ボディラインが丸みを帯びた体型。",

  // フィードバックトースト
  "weather.alert": "気象災害特別警報アラート",
  "activity.suitability": "活動別のアウトドア適合性",
  "toast.feedback_ok": "フィードバックが反映されました。推薦を更新します。",
  "toast.feedback_fail": "フィードバックの送信に失敗しました。後でもう一度お試しください。",
  "toast.network_error": "ネットワークエラーが発生しました。",

  // 認証モーダル
  "auth.login": "アカウントにサインイン",
  "auth.signup": "アカウントを作成",
  "auth.email": "メールアドレス",
  "auth.password": "パスワード",
  "auth.submit_login": "サインイン",
  "auth.submit_signup": "登録",
  "auth.switch_signup": "アカウントをお持ちでない方はこちら",
  "auth.switch_login": "すでにアカウントをお持ちの方はこちら",
  "auth.close": "✕ 閉じる",
};

export default ja;
