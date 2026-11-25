import AVFoundation
import UIKit
import UserNotifications
import WebKit

/// 小鹿的网址。壳子每次打开都是线上最新的页面，网页更新了不用重新装 app。
let home = URL(string: "https://sariel111-spec.github.io/deer/")!

@main
final class AppDelegate: UIResponder, UIApplicationDelegate, UNUserNotificationCenterDelegate {
  var window: UIWindow?
  private let web = WebController()

  func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
    // 声音类别设成「播放」：网页里那段听不见的声音在后台也能继续，系统就不会把页面停掉
    let session = AVAudioSession.sharedInstance()
    try? session.setCategory(.playback, mode: .default, options: [.mixWithOthers])
    try? session.setActive(true)

    UNUserNotificationCenter.current().delegate = self

    let w = UIWindow(frame: UIScreen.main.bounds)
    w.rootViewController = web
    w.makeKeyAndVisible()
    window = w
    return true
  }

  // 正开着小鹿的时候不再弹横幅，页面里已经看得到新消息
  func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification, withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
    completionHandler([])
  }

  // 点通知：回到那一位的对话
  func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse, withCompletionHandler completionHandler: @escaping () -> Void) {
    if let pid = response.notification.request.content.userInfo["pid"] as? String {
      web.open(pid: pid)
    }
    completionHandler()
  }
}

final class WebController: UIViewController, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {
  private var webView: WKWebView!
  private var loaded = false
  private var waiting: String?

  override func loadView() {
    let config = WKWebViewConfiguration()
    config.allowsInlineMediaPlayback = true
    config.mediaTypesRequiringUserActionForPlayback = []
    config.allowsPictureInPictureMediaPlayback = true
    config.limitsNavigationsToAppBoundDomains = true
    config.applicationNameForUserAgent = "DeerApp/1.0"
    config.userContentController.add(self, name: "deer")

    let view = WKWebView(frame: .zero, configuration: config)
    view.navigationDelegate = self
    view.uiDelegate = self
    view.isOpaque = false
    view.backgroundColor = .systemBackground
    view.scrollView.backgroundColor = .systemBackground
    view.scrollView.bounces = false
    // 页面自己按刘海和底部横条留边，这里不要再缩一遍
    view.scrollView.contentInsetAdjustmentBehavior = .never
    view.allowsLinkPreview = false
    view.allowsBackForwardNavigationGestures = false
    webView = view
    self.view = view
  }

  override func viewDidLoad() {
    super.viewDidLoad()
    load()
  }

  private func load() {
    webView.load(URLRequest(url: home))
  }

  /// 点通知进来时，页面可能还没载好：先记着，载好再跳
  func open(pid: String) {
    if loaded {
      run("window.__deerOpen && window.__deerOpen(\(quoted(pid)))")
    } else {
      waiting = pid
    }
  }

  private func run(_ script: String) {
    webView.evaluateJavaScript(script, completionHandler: nil)
  }

  /// 把一段文字安全地放进脚本里
  private func quoted(_ text: String) -> String {
    guard let data = try? JSONSerialization.data(withJSONObject: [text]), let json = String(data: data, encoding: .utf8) else { return "\"\"" }
    return String(json.dropFirst().dropLast())
  }

  // MARK: 页面发来的请求

  func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
    guard let body = message.body as? [String: Any], let type = body["type"] as? String else { return }
    switch type {
    case "askNotify":
      UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, _ in
        DispatchQueue.main.async {
          self.run("window.__deerNotify && window.__deerNotify(\(granted ? "true" : "false"))")
        }
      }
    case "notify":
      // 开着小鹿就不用弹了
      guard UIApplication.shared.applicationState != .active else { return }
      let content = UNMutableNotificationContent()
      content.title = body["title"] as? String ?? "小鹿"
      content.body = body["body"] as? String ?? ""
      content.sound = .default
      let pid = body["pid"] as? String ?? ""
      content.userInfo = ["pid": pid]
      content.threadIdentifier = pid
      UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: UUID().uuidString, content: content, trigger: nil), withCompletionHandler: nil)
    case "badge":
      let count = body["n"] as? Int ?? 0
      UIApplication.shared.applicationIconBadgeNumber = count
      if count == 0 {
        UNUserNotificationCenter.current().removeAllDeliveredNotifications()
      }
    case "share":
      // 导出备份、导出字卡：存成临时文件，交给系统的分享面板（可以存到「文件」）
      guard let name = body["name"] as? String, let text = body["text"] as? String else { return }
      let safe = name.replacingOccurrences(of: "/", with: "-")
      let file = FileManager.default.temporaryDirectory.appendingPathComponent(safe)
      do {
        try text.write(to: file, atomically: true, encoding: .utf8)
      } catch {
        return
      }
      let sheet = UIActivityViewController(activityItems: [file], applicationActivities: nil)
      sheet.popoverPresentationController?.sourceView = view
      present(sheet, animated: true, completion: nil)
    default:
      break
    }
  }

  // MARK: 载入

  func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
    loaded = true
    if let pid = waiting {
      waiting = nil
      // 给页面一点时间把数据读出来
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) {
        self.open(pid: pid)
      }
    }
  }

  func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
    failed()
  }

  func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
    failed()
  }

  // 页面那个进程被系统回收了（内存紧张时会发生）：重新载入
  func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
    loaded = false
    load()
  }

  private func failed() {
    guard !loaded, presentedViewController == nil else { return }
    let alert = UIAlertController(title: "没连上", message: "小鹿的页面没有打开。检查一下网络再试。", preferredStyle: .alert)
    alert.addAction(UIAlertAction(title: "再试一次", style: .default) { _ in
      self.load()
    })
    present(alert, animated: true, completion: nil)
  }

  // 小鹿以外的链接交给 Safari，不在壳子里开
  func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
    guard let url = navigationAction.request.url else {
      decisionHandler(.cancel)
      return
    }
    let inside = url.host == home.host || url.scheme == "about" || url.scheme == "blob" || url.scheme == "data"
    if inside || navigationAction.targetFrame?.isMainFrame == false {
      decisionHandler(.allow)
      return
    }
    if url.scheme == "http" || url.scheme == "https" {
      UIApplication.shared.open(url, options: [:], completionHandler: nil)
    }
    decisionHandler(.cancel)
  }

  // 页面想开新窗口的链接，同样交给 Safari
  func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
    if let url = navigationAction.request.url, url.scheme == "http" || url.scheme == "https" {
      UIApplication.shared.open(url, options: [:], completionHandler: nil)
    }
    return nil
  }
}
