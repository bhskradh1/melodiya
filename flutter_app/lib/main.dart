import 'dart:async';
import 'dart:io';
import 'dart:typed_data';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_flutter_android/webview_flutter_android.dart';

const _appName = 'Melodiya';
const _port = 43110;
const _origin = 'http://127.0.0.1:$_port';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(
    statusBarColor: Color(0xFF0A0A0A),
    statusBarIconBrightness: Brightness.light,
    systemNavigationBarColor: Color(0xFF0A0A0A),
    systemNavigationBarIconBrightness: Brightness.light,
  ));
  runApp(const MelodiyaApp());
}

class MelodiyaApp extends StatelessWidget {
  const MelodiyaApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: _appName,
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        brightness: Brightness.dark,
        scaffoldBackgroundColor: const Color(0xFF0A0A0A),
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFFA855F7),
          brightness: Brightness.dark,
        ),
        useMaterial3: true,
      ),
      home: const _MelodiyaHome(),
    );
  }
}

class _MelodiyaHome extends StatefulWidget {
  const _MelodiyaHome();

  @override
  State<_MelodiyaHome> createState() => _MelodiyaHomeState();
}

class _MelodiyaHomeState extends State<_MelodiyaHome> {
  late final WebViewController _web;
  HttpServer? _server;
  bool _loading = true;
  bool _canGoBack = false;
  String? _error;
  int _progress = 0;

  @override
  void initState() {
    super.initState();
    _web = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(const Color(0xFF0A0A0A))
      ..addJavaScriptChannel(
        'MelodiyaBridge',
        onMessageReceived: (message) {
          final value = message.message == 'true';
          if (mounted && value != _canGoBack) {
            setState(() => _canGoBack = value);
          }
        },
      )
      ..setNavigationDelegate(
        NavigationDelegate(
          onProgress: (progress) {
            if (!mounted) return;
            setState(() {
              _progress = progress;
              _loading = progress < 100;
            });
            unawaited(_updateBackState());
          },
          onPageStarted: (_) {
            if (mounted) setState(() => _loading = true);
          },
          onPageFinished: (_) {
            if (!mounted) return;
            setState(() {
              _loading = false;
              _progress = 100;
              _error = null;
            });
            unawaited(_installHistoryBridge());
          },
          onWebResourceError: (error) {
            if (error.isForMainFrame == true && mounted) {
              setState(() {
                _loading = false;
                _error = error.description;
              });
            }
          },
          onNavigationRequest: (request) {
            final uri = Uri.tryParse(request.url);
            if (uri == null) return NavigationDecision.prevent;

            final local = uri.scheme == 'http' &&
                uri.host == '127.0.0.1' &&
                uri.port == _port;
            if (local) return NavigationDecision.navigate;

            // Keep the bundled app on its own origin; open external links safely.
            unawaited(_openExternal(uri));
            return NavigationDecision.prevent;
          },
        ),
      );
    unawaited(_start());
  }

  Future<void> _start() async {
    try {
      _server = await HttpServer.bind(
        InternetAddress.loopbackIPv4,
        _port,
        shared: false,
      );
      _server!.listen(_serveAsset, onError: (Object error) {
        if (mounted) setState(() => _error = 'Local server error: $error');
      });

      final platform = _web.platform;
      if (platform is AndroidWebViewController) {
        await platform.setMediaPlaybackRequiresUserGesture(false);
      }

      await _web.loadRequest(Uri.parse('$_origin/'));
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = 'Could not start the bundled app: $error';
      });
    }
  }

  Future<void> _serveAsset(HttpRequest request) async {
    final response = request.response;
    if (request.method != 'GET' && request.method != 'HEAD') {
      response.statusCode = HttpStatus.methodNotAllowed;
      await response.close();
      return;
    }

    final path = request.uri.path;
    if (path.split('/').contains('..') || path.contains(r'\\')) {
      response.statusCode = HttpStatus.forbidden;
      await response.close();
      return;
    }

    var name = path == '/' ? 'index.html' : path.substring(1);
    ByteData bytes;
    try {
      bytes = await rootBundle.load('assets/web/$name');
    } on FlutterError {
      // Client-side routes fall back to index.html; missing assets do not.
      if (name.split('/').last.contains('.')) {
        response.statusCode = HttpStatus.notFound;
        await response.close();
        return;
      }
      try {
        name = 'index.html';
        bytes = await rootBundle.load('assets/web/index.html');
      } on FlutterError {
        response.statusCode = HttpStatus.serviceUnavailable;
        response.headers.contentType = ContentType.text;
        response.write('Bundled web files are missing. Build the web app first.');
        await response.close();
        return;
      }
    }

    response.headers.set(HttpHeaders.contentTypeHeader, _contentType(name));
    response.headers.set(HttpHeaders.cacheControlHeader, 'no-cache');
    response.headers.set('X-Content-Type-Options', 'nosniff');
    if (request.method == 'HEAD') {
      await response.close();
      return;
    }
    final data = bytes.buffer.asUint8List(bytes.offsetInBytes, bytes.lengthInBytes);
    response.add(data);
    await response.close();
  }

  String _contentType(String path) {
    const types = <String, String>{
      'html': 'text/html; charset=utf-8',
      'js': 'application/javascript; charset=utf-8',
      'mjs': 'application/javascript; charset=utf-8',
      'css': 'text/css; charset=utf-8',
      'json': 'application/json; charset=utf-8',
      'webmanifest': 'application/manifest+json; charset=utf-8',
      'svg': 'image/svg+xml',
      'png': 'image/png',
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'webp': 'image/webp',
      'gif': 'image/gif',
      'ico': 'image/x-icon',
      'woff': 'font/woff',
      'woff2': 'font/woff2',
      'ttf': 'font/ttf',
      'otf': 'font/otf',
      'wasm': 'application/wasm',
      'mp3': 'audio/mpeg',
      'mp4': 'video/mp4',
      'txt': 'text/plain; charset=utf-8',
      'xml': 'application/xml; charset=utf-8',
    };
    final ext = path.contains('.') ? path.split('.').last.toLowerCase() : '';
    return types[ext] ?? 'application/octet-stream';
  }

  Future<void> _installHistoryBridge() async {
    const script = r'''(function () {
      if (window.__melodiyaBackBridgeInstalled) return;
      window.__melodiyaBackBridgeInstalled = true;
      function notifyNative() {
        try {
          if (window.MelodiyaBridge) {
            window.MelodiyaBridge.postMessage(String(window.history.length > 1));
          }
        } catch (_) {}
      }
      ['pushState', 'replaceState'].forEach(function (name) {
        var original = window.history[name];
        window.history[name] = function () {
          var result = original.apply(this, arguments);
          notifyNative();
          return result;
        };
      });
      window.addEventListener('popstate', notifyNative);
      notifyNative();
    })();''';
    try {
      await _web.runJavaScript(script);
    } catch (_) {
      // WebView may navigate while this bridge is being installed.
    }
  }

  Future<void> _updateBackState() async {
    try {
      final value = await _web.canGoBack();
      if (mounted && value != _canGoBack) setState(() => _canGoBack = value);
    } catch (_) {}
  }

  Future<void> _openExternal(Uri uri) async {
    try {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    } catch (_) {
      // Ignore links Android has no app available to handle.
    }
  }

  Future<bool> _onBack() async {
    if (_canGoBack) {
      await _web.goBack();
      return false;
    }
    return true;
  }

  Future<void> _retry() async {
    setState(() {
      _error = null;
      _loading = true;
    });
    if (_server == null) {
      await _start();
    } else {
      await _web.loadRequest(Uri.parse('$_origin/'));
    }
  }

  @override
  void dispose() {
    final server = _server;
    if (server != null) unawaited(server.close(force: true));
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return WillPopScope(
      onWillPop: _onBack,
      child: Scaffold(
        body: SafeArea(
          top: false,
          bottom: false,
          child: Stack(
            children: [
              WebViewWidget(controller: _web),
              if (_loading && _error == null)
                Align(
                  alignment: Alignment.topCenter,
                  child: LinearProgressIndicator(
                    minHeight: 2,
                    value: _progress >= 100 ? null : _progress / 100,
                    backgroundColor: Colors.transparent,
                    color: const Color(0xFFA855F7),
                  ),
                ),
              if (_error != null)
                Positioned.fill(
                  child: ColoredBox(
                    color: const Color(0xFF0A0A0A),
                    child: Center(
                      child: Padding(
                        padding: const EdgeInsets.all(28),
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            const Icon(Icons.music_note_rounded,
                                color: Color(0xFFA855F7), size: 64),
                            const SizedBox(height: 16),
                            const Text(_appName,
                                style: TextStyle(
                                    fontSize: 24, fontWeight: FontWeight.bold)),
                            const SizedBox(height: 10),
                            const Text(
                              'Melodiya could not start. Check the bundled assets and internet connection, then retry.',
                              textAlign: TextAlign.center,
                              style: TextStyle(color: Colors.white70, height: 1.5),
                            ),
                            const SizedBox(height: 12),
                            Text(
                              _error!,
                              maxLines: 3,
                              overflow: TextOverflow.ellipsis,
                              textAlign: TextAlign.center,
                              style: const TextStyle(
                                  color: Colors.white38, fontSize: 11),
                            ),
                            const SizedBox(height: 22),
                            FilledButton.icon(
                              onPressed: _retry,
                              icon: const Icon(Icons.refresh_rounded),
                              label: const Text('Retry'),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
