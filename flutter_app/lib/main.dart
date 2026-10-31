import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';
import 'package:http/http.dart' as http;
import 'package:open_filex/open_filex.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:path_provider/path_provider.dart';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:audio_service/audio_service.dart';
import 'package:just_audio/just_audio.dart';
import 'package:just_audio_background/just_audio_background.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:webview_flutter/webview_flutter.dart';
import 'package:webview_flutter_android/webview_flutter_android.dart';

const _appName = 'Melodiya';
const _port = 43110;
const _origin = 'http://127.0.0.1:$_port';
const _updateManifestUrl = 'https://xdtgtwlpkgldszmufoay.supabase.co/storage/v1/object/public/melodiya-app-updates/version.json';
const _expectedAppId = 'com.melodiya.melodiya_app';
const _updateCheckInterval = Duration(hours: 12);

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(
    statusBarColor: Color(0xFF0A0A0A),
    statusBarIconBrightness: Brightness.light,
    systemNavigationBarColor: Color(0xFF0A0A0A),
    systemNavigationBarIconBrightness: Brightness.light,
  ));
  await JustAudioBackground.init(
    androidNotificationChannelId: 'com.melodiya.melodiya_app.audio',
    androidNotificationChannelName: 'Melodiya playback',
    androidNotificationChannelDescription: 'Controls for Melodiya music playback',
    androidNotificationOngoing: true,
  );
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

class _MelodiyaHomeState extends State<_MelodiyaHome> with WidgetsBindingObserver {
  late final WebViewController _web;
  late final AudioPlayer _nativeAudioPlayer;
  StreamSubscription? _nativePlayerStateSubscription;
  StreamSubscription? _nativeErrorSubscription;
  Timer? _nativeStateTimer;
  bool _nativeAudioActive = false;
  bool _nativeEndedNotified = false;
  bool _nativeRequestedPlaying = false;
  String? _activeNativeUrl;
  DateTime? _lastWebAudioCommandAt;
  HttpServer? _server;
  bool _loading = true;
  bool _canGoBack = false;
  String? _error;
  int _progress = 0;
  bool _updateCheckInProgress = false;
  bool _updateDialogOpen = false;
  bool _updateDownloading = false;
  DateTime? _lastUpdateCheckAt;
  Map<String, dynamic>? _availableUpdate;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    _nativeAudioPlayer = AudioPlayer();
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
      ..addJavaScriptChannel(
        'MelodiyaNativeAudio',
        onMessageReceived: (message) {
          unawaited(_handleNativeAudioMessage(message.message));
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
            unawaited(_checkForUpdates());
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
    _nativePlayerStateSubscription = _nativeAudioPlayer.playerStateStream.listen((state) {
      if (!_nativeAudioActive) return;
      if (state.processingState == ProcessingState.completed) {
        if (!_nativeEndedNotified) {
          _nativeEndedNotified = true;
          _publishNativeAudioState(event: 'ended');
        }
      } else {
        _publishNativeAudioState();
      }
    });
    _nativeErrorSubscription = _nativeAudioPlayer.errorStream.listen((error) {
      if (_nativeAudioActive) _publishNativeAudioState(event: 'error', message: error.toString());
    });
    _nativeStateTimer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (_nativeAudioActive) _publishNativeAudioState();
    });
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


  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state != AppLifecycleState.resumed || _updateCheckInProgress) return;
    final lastCheck = _lastUpdateCheckAt;
    if (lastCheck == null || DateTime.now().difference(lastCheck) >= _updateCheckInterval) {
      unawaited(_checkForUpdates());
    }
  }

  Future<void> _checkForUpdates() async {
    if (_updateCheckInProgress) return;
    _updateCheckInProgress = true;
    _lastUpdateCheckAt = DateTime.now();
    try {
      final packageInfo = await PackageInfo.fromPlatform();
      if (packageInfo.packageName != _expectedAppId) return;

      final manifestUri = Uri.parse(_updateManifestUrl).replace(
        queryParameters: {'cacheBust': DateTime.now().millisecondsSinceEpoch.toString()},
      );
      final response = await http.get(
        manifestUri,
        headers: const {'Cache-Control': 'no-cache', 'Pragma': 'no-cache'},
      ).timeout(const Duration(seconds: 20));
      if (response.statusCode != 200) return;

      final decoded = jsonDecode(response.body);
      if (decoded is! Map) return;
      final manifest = Map<String, dynamic>.from(decoded);
      if (manifest['appId'] != _expectedAppId) return;

      final latestBuild = int.tryParse(manifest['buildNumber']?.toString() ?? '');
      final currentBuild = int.tryParse(packageInfo.buildNumber) ?? 0;
      final apkUrl = Uri.tryParse(manifest['apkUrl']?.toString() ?? '');
      final checksum = manifest['sha256']?.toString().toLowerCase() ?? '';
      if (latestBuild == null ||
          latestBuild <= currentBuild ||
          apkUrl == null ||
          apkUrl.scheme != 'https' ||
          !RegExp(r'^[a-f0-9]{64}    try {
      final decoded = jsonDecode(rawMessage);
      if (decoded is! Map) return;
      final message = Map<String, dynamic>.from(decoded);
      final command = message['command'] as String?;
      if (command == null) return;
      _lastWebAudioCommandAt = DateTime.now();

      switch (command) {
        case 'load':
          final rawUrl = message['url'] as String?;
          final uri = rawUrl == null ? null : Uri.tryParse(rawUrl);
          if (uri == null || uri.scheme != 'https' || !uri.hasAuthority) {
            throw const FormatException('Native playback requires a direct HTTPS audio URL.');
          }
          final title = (message['title'] as String?)?.trim();
          final artist = (message['artist'] as String?)?.trim();
          final rawArtwork = message['artwork'] as String?;
          final parsedArtwork = rawArtwork == null ? null : Uri.tryParse(rawArtwork);
          final artworkUri = parsedArtwork != null &&
                  (parsedArtwork.scheme == 'https' || parsedArtwork.scheme == 'http')
              ? parsedArtwork
              : null;

          _nativeAudioActive = true;
          _nativeEndedNotified = false;
          _activeNativeUrl = uri.toString();
          _nativeRequestedPlaying = message['autoplay'] == true;
          await _nativeAudioPlayer.setAudioSource(
            AudioSource.uri(
              uri,
              tag: MediaItem(
                id: uri.toString(),
                album: 'Melodiya',
                title: title == null || title.isEmpty ? 'Unknown track' : title,
                artist: artist == null || artist.isEmpty ? 'Unknown artist' : artist,
                artUri: artworkUri,
              ),
            ),
          );
          if (_nativeRequestedPlaying) {
            unawaited(_nativeAudioPlayer.play().catchError((Object error) {
              _publishNativeAudioState(event: 'error', message: error.toString());
            }));
          }
          _publishNativeAudioState();
          break;

        case 'play':
          if (_activeNativeUrl != null) {
            _nativeRequestedPlaying = true;
            unawaited(_nativeAudioPlayer.play().catchError((Object error) {
              _publishNativeAudioState(event: 'error', message: error.toString());
            }));
          }
          break;

        case 'pause':
          _nativeRequestedPlaying = false;
          await _nativeAudioPlayer.pause();
          _publishNativeAudioState();
          break;

        case 'stop':
          _nativeRequestedPlaying = false;
          _nativeAudioActive = false;
          _activeNativeUrl = null;
          await _nativeAudioPlayer.stop();
          _publishNativeAudioState(event: 'stopped', force: true);
          break;

        case 'seek':
          final rawPosition = message['position'];
          if (rawPosition is num) {
            await _nativeAudioPlayer.seek(
              Duration(milliseconds: (rawPosition.clamp(0, 86400) * 1000).round()),
            );
          }
          _publishNativeAudioState();
          break;

        case 'volume':
          final rawVolume = message['volume'];
          if (rawVolume is num) {
            await _nativeAudioPlayer.setVolume(
              rawVolume.toDouble().clamp(0.0, 1.0).toDouble(),
            );
          }
          break;
      }
    } catch (error) {
      _publishNativeAudioState(event: 'error', message: error.toString(), force: true);
    }
  }

  void _publishNativeAudioState({String? event, String? message, bool force = false}) {
    if (!force && !_nativeAudioActive) return;
    final playerState = _nativeAudioPlayer.playerState;
    final lastCommand = _lastWebAudioCommandAt;
    final syncPlaying = lastCommand == null ||
        DateTime.now().difference(lastCommand) > const Duration(seconds: 2);
    final payload = <String, dynamic>{
      'event': event ?? 'state',
      'playing': playerState.playing,
      'position': _nativeAudioPlayer.position.inMilliseconds / 1000.0,
      'duration': (_nativeAudioPlayer.duration?.inMilliseconds ?? 0) / 1000.0,
      'processingState': playerState.processingState.name,
      'syncPlaying': syncPlaying,
    };
    if (message != null) payload['message'] = message;
    final script =
        'window.dispatchEvent(new CustomEvent("melodiya-native-audio-state", {detail: ${jsonEncode(payload)}}));';
    unawaited(_web.runJavaScript(script).catchError((_) {}));
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
    WidgetsBinding.instance.removeObserver(this);
    final server = _server;
    if (server != null) unawaited(server.close(force: true));
    _nativeStateTimer?.cancel();
    if (_nativePlayerStateSubscription != null) unawaited(_nativePlayerStateSubscription!.cancel());
    if (_nativeErrorSubscription != null) unawaited(_nativeErrorSubscription!.cancel());
    unawaited(_nativeAudioPlayer.dispose());
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
                Positioned.fill(
                  child: IgnorePointer(
                    child: ColoredBox(
                      color: const Color(0xFF0A0A0A),
                      child: Center(
                        child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Image.asset(
                              'assets/web/icon-512x512.png',
                              width: 92,
                              height: 92,
                              fit: BoxFit.contain,
                              errorBuilder: (_, __, ___) => const Icon(
                                Icons.music_note_rounded,
                                color: Color(0xFFA855F7),
                                size: 72,
                              ),
                            ),
                            const SizedBox(height: 16),
                            const Text(
                              'Melodiya',
                              style: TextStyle(fontSize: 25, fontWeight: FontWeight.w700),
                            ),
                            const SizedBox(height: 16),
                            SizedBox(
                              width: 132,
                              child: LinearProgressIndicator(
                                minHeight: 2,
                                value: _progress >= 100 ? null : _progress / 100,
                                backgroundColor: Colors.white12,
                                color: const Color(0xFFA855F7),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                ),
              if (_availableUpdate != null && !_updateDownloading)
                Positioned(
                  top: MediaQuery.of(context).padding.top + 8,
                  right: 12,
                  child: SafeArea(
                    child: FilledButton.tonalIcon(
                      onPressed: () => unawaited(
                        _showUpdateDialog(
                          _availableUpdate!,
                          int.tryParse(_availableUpdate!['buildNumber']?.toString() ?? ''),
                        ),
                      ),
                      icon: const Icon(Icons.system_update_alt_rounded, size: 18),
                      label: const Text('Update'),
                    ),
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
                            Image.asset(
                              'assets/web/icon-512x512.png',
                              width: 68,
                              height: 68,
                              errorBuilder: (_, __, ___) => const Icon(
                                Icons.music_note_rounded,
                                color: Color(0xFFA855F7),
                                size: 64,
                              ),
                            ),
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
).hasMatch(checksum)) {
        return;
      }

      if (!mounted) return;
      setState(() => _availableUpdate = manifest);
      await _showUpdateDialog(manifest, currentBuild);
    } catch (_) {
      // Update checks are best-effort and must never block app startup.
    } finally {
      _updateCheckInProgress = false;
    }
  }

  Future<void> _showUpdateDialog(
    Map<String, dynamic> manifest,
    [int? currentBuild],
  ) async {
    if (!mounted || _updateDialogOpen || _updateDownloading) return;
    _updateDialogOpen = true;
    final version = manifest['version']?.toString() ?? 'Latest';
    final build = manifest['buildNumber']?.toString() ?? '';
    final notes = manifest['releaseNotes']?.toString().trim() ?? '';
    final mandatory = manifest['mandatory'] == true;
    try {
      await showDialog<void>(
        context: context,
        barrierDismissible: !mandatory,
        builder: (dialogContext) => AlertDialog(
          icon: const Icon(Icons.system_update_rounded, color: Color(0xFFA855F7), size: 34),
          title: const Text('Melodiya update available'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Version ' + version + ' (build ' + build + ') is ready.'),
              if (currentBuild != null) ...[
                const SizedBox(height: 6),
                Text('Installed build: ' + currentBuild.toString(),
                    style: const TextStyle(color: Colors.white60, fontSize: 12)),
              ],
              if (notes.isNotEmpty) ...[
                const SizedBox(height: 12),
                Text(notes, style: const TextStyle(color: Colors.white70, height: 1.4)),
              ],
              const SizedBox(height: 12),
              const Text(
                'The update will be downloaded and checked before Android opens its installer.',
                style: TextStyle(color: Colors.white54, fontSize: 12, height: 1.4),
              ),
            ],
          ),
          actions: [
            if (!mandatory)
              TextButton(
                onPressed: () => Navigator.of(dialogContext).pop(),
                child: const Text('Later'),
              ),
            FilledButton.icon(
              onPressed: () {
                Navigator.of(dialogContext).pop();
                unawaited(_downloadAndInstallUpdate(manifest));
              },
              icon: const Icon(Icons.download_rounded),
              label: const Text('Update now'),
            ),
          ],
        ),
      );
    } finally {
      _updateDialogOpen = false;
    }
  }

  Future<void> _downloadAndInstallUpdate(Map<String, dynamic> manifest) async {
    if (_updateDownloading || !Platform.isAndroid) return;
    final apkUri = Uri.tryParse(manifest['apkUrl']?.toString() ?? '');
    final expectedHash = manifest['sha256']?.toString().toLowerCase() ?? '';
    final build = manifest['buildNumber']?.toString() ?? 'latest';
    if (apkUri == null ||
        apkUri.scheme != 'https' ||
        !RegExp(r'^[a-f0-9]{64}    try {
      final decoded = jsonDecode(rawMessage);
      if (decoded is! Map) return;
      final message = Map<String, dynamic>.from(decoded);
      final command = message['command'] as String?;
      if (command == null) return;
      _lastWebAudioCommandAt = DateTime.now();

      switch (command) {
        case 'load':
          final rawUrl = message['url'] as String?;
          final uri = rawUrl == null ? null : Uri.tryParse(rawUrl);
          if (uri == null || uri.scheme != 'https' || !uri.hasAuthority) {
            throw const FormatException('Native playback requires a direct HTTPS audio URL.');
          }
          final title = (message['title'] as String?)?.trim();
          final artist = (message['artist'] as String?)?.trim();
          final rawArtwork = message['artwork'] as String?;
          final parsedArtwork = rawArtwork == null ? null : Uri.tryParse(rawArtwork);
          final artworkUri = parsedArtwork != null &&
                  (parsedArtwork.scheme == 'https' || parsedArtwork.scheme == 'http')
              ? parsedArtwork
              : null;

          _nativeAudioActive = true;
          _nativeEndedNotified = false;
          _activeNativeUrl = uri.toString();
          _nativeRequestedPlaying = message['autoplay'] == true;
          await _nativeAudioPlayer.setAudioSource(
            AudioSource.uri(
              uri,
              tag: MediaItem(
                id: uri.toString(),
                album: 'Melodiya',
                title: title == null || title.isEmpty ? 'Unknown track' : title,
                artist: artist == null || artist.isEmpty ? 'Unknown artist' : artist,
                artUri: artworkUri,
              ),
            ),
          );
          if (_nativeRequestedPlaying) {
            unawaited(_nativeAudioPlayer.play().catchError((Object error) {
              _publishNativeAudioState(event: 'error', message: error.toString());
            }));
          }
          _publishNativeAudioState();
          break;

        case 'play':
          if (_activeNativeUrl != null) {
            _nativeRequestedPlaying = true;
            unawaited(_nativeAudioPlayer.play().catchError((Object error) {
              _publishNativeAudioState(event: 'error', message: error.toString());
            }));
          }
          break;

        case 'pause':
          _nativeRequestedPlaying = false;
          await _nativeAudioPlayer.pause();
          _publishNativeAudioState();
          break;

        case 'stop':
          _nativeRequestedPlaying = false;
          _nativeAudioActive = false;
          _activeNativeUrl = null;
          await _nativeAudioPlayer.stop();
          _publishNativeAudioState(event: 'stopped', force: true);
          break;

        case 'seek':
          final rawPosition = message['position'];
          if (rawPosition is num) {
            await _nativeAudioPlayer.seek(
              Duration(milliseconds: (rawPosition.clamp(0, 86400) * 1000).round()),
            );
          }
          _publishNativeAudioState();
          break;

        case 'volume':
          final rawVolume = message['volume'];
          if (rawVolume is num) {
            await _nativeAudioPlayer.setVolume(
              rawVolume.toDouble().clamp(0.0, 1.0).toDouble(),
            );
          }
          break;
      }
    } catch (error) {
      _publishNativeAudioState(event: 'error', message: error.toString(), force: true);
    }
  }

  void _publishNativeAudioState({String? event, String? message, bool force = false}) {
    if (!force && !_nativeAudioActive) return;
    final playerState = _nativeAudioPlayer.playerState;
    final lastCommand = _lastWebAudioCommandAt;
    final syncPlaying = lastCommand == null ||
        DateTime.now().difference(lastCommand) > const Duration(seconds: 2);
    final payload = <String, dynamic>{
      'event': event ?? 'state',
      'playing': playerState.playing,
      'position': _nativeAudioPlayer.position.inMilliseconds / 1000.0,
      'duration': (_nativeAudioPlayer.duration?.inMilliseconds ?? 0) / 1000.0,
      'processingState': playerState.processingState.name,
      'syncPlaying': syncPlaying,
    };
    if (message != null) payload['message'] = message;
    final script =
        'window.dispatchEvent(new CustomEvent("melodiya-native-audio-state", {detail: ${jsonEncode(payload)}}));';
    unawaited(_web.runJavaScript(script).catchError((_) {}));
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
    _nativeStateTimer?.cancel();
    if (_nativePlayerStateSubscription != null) unawaited(_nativePlayerStateSubscription!.cancel());
    if (_nativeErrorSubscription != null) unawaited(_nativeErrorSubscription!.cancel());
    unawaited(_nativeAudioPlayer.dispose());
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
).hasMatch(expectedHash)) {
      return;
    }

    setState(() => _updateDownloading = true);
    final messenger = ScaffoldMessenger.of(context);
    messenger.hideCurrentSnackBar();
    messenger.showSnackBar(
      const SnackBar(
        duration: Duration(minutes: 4),
        content: Row(
          children: [
            SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2)),
            SizedBox(width: 12),
            Expanded(child: Text('Downloading Melodiya update…')),
          ],
        ),
      ),
    );

    final client = http.Client();
    File? apkFile;
    try {
      final directory = await getTemporaryDirectory();
      apkFile = File(directory.path + '/melodiya-update-' + build + '.apk');
      if (await apkFile.exists()) await apkFile.delete();

      final request = http.Request('GET', apkUri);
      final response = await client.send(request).timeout(const Duration(minutes: 3));
      if (response.statusCode != 200) {
        throw HttpException('Update download failed (HTTP ' + response.statusCode.toString() + ').');
      }
      const maxApkBytes = 100 * 1024 * 1024;
      if (response.contentLength != null && response.contentLength! > maxApkBytes) {
        throw const FormatException('The update file is larger than the allowed size.');
      }

      final sink = apkFile.openWrite();
      var receivedBytes = 0;
      try {
        await for (final chunk in response.stream.timeout(const Duration(minutes: 4))) {
          receivedBytes += chunk.length;
          if (receivedBytes > maxApkBytes) {
            throw const FormatException('The update file is larger than the allowed size.');
          }
          sink.add(chunk);
        }
        await sink.flush();
      } finally {
        await sink.close();
      }

      if (receivedBytes == 0) throw const FormatException('The downloaded update is empty.');
      final actualHash = sha256.convert(await apkFile.readAsBytes()).toString();
      if (actualHash != expectedHash) {
        throw const FormatException('Update verification failed. The downloaded file was not installed.');
      }

      messenger.hideCurrentSnackBar();
      messenger.showSnackBar(const SnackBar(
        duration: Duration(seconds: 5),
        content: Text('Download verified. Opening Android installer…'),
      ));
      final result = await OpenFilex.open(
        apkFile.path,
        type: 'application/vnd.android.package-archive',
      );
      if (result.type != ResultType.done) {
        if (result.type == ResultType.permissionDenied) {
          throw StateError(
            'Allow Melodiya to install unknown apps in Android settings, then tap Update again.',
          );
        }
        throw StateError(result.message);
      }
    } catch (error) {
      if (apkFile != null && await apkFile.exists()) {
        try {
          await apkFile.delete();
        } catch (_) {}
      }
      if (mounted) {
        messenger.hideCurrentSnackBar();
        messenger.showSnackBar(
          SnackBar(content: Text('Could not install update: ' + error.toString())),
        );
      }
    } finally {
      client.close();
      if (mounted) setState(() => _updateDownloading = false);
    }
  }

  Future<void> _handleNativeAudioMessage(String rawMessage) async {
    try {
      final decoded = jsonDecode(rawMessage);
      if (decoded is! Map) return;
      final message = Map<String, dynamic>.from(decoded);
      final command = message['command'] as String?;
      if (command == null) return;
      _lastWebAudioCommandAt = DateTime.now();

      switch (command) {
        case 'load':
          final rawUrl = message['url'] as String?;
          final uri = rawUrl == null ? null : Uri.tryParse(rawUrl);
          if (uri == null || uri.scheme != 'https' || !uri.hasAuthority) {
            throw const FormatException('Native playback requires a direct HTTPS audio URL.');
          }
          final title = (message['title'] as String?)?.trim();
          final artist = (message['artist'] as String?)?.trim();
          final rawArtwork = message['artwork'] as String?;
          final parsedArtwork = rawArtwork == null ? null : Uri.tryParse(rawArtwork);
          final artworkUri = parsedArtwork != null &&
                  (parsedArtwork.scheme == 'https' || parsedArtwork.scheme == 'http')
              ? parsedArtwork
              : null;

          _nativeAudioActive = true;
          _nativeEndedNotified = false;
          _activeNativeUrl = uri.toString();
          _nativeRequestedPlaying = message['autoplay'] == true;
          await _nativeAudioPlayer.setAudioSource(
            AudioSource.uri(
              uri,
              tag: MediaItem(
                id: uri.toString(),
                album: 'Melodiya',
                title: title == null || title.isEmpty ? 'Unknown track' : title,
                artist: artist == null || artist.isEmpty ? 'Unknown artist' : artist,
                artUri: artworkUri,
              ),
            ),
          );
          if (_nativeRequestedPlaying) {
            unawaited(_nativeAudioPlayer.play().catchError((Object error) {
              _publishNativeAudioState(event: 'error', message: error.toString());
            }));
          }
          _publishNativeAudioState();
          break;

        case 'play':
          if (_activeNativeUrl != null) {
            _nativeRequestedPlaying = true;
            unawaited(_nativeAudioPlayer.play().catchError((Object error) {
              _publishNativeAudioState(event: 'error', message: error.toString());
            }));
          }
          break;

        case 'pause':
          _nativeRequestedPlaying = false;
          await _nativeAudioPlayer.pause();
          _publishNativeAudioState();
          break;

        case 'stop':
          _nativeRequestedPlaying = false;
          _nativeAudioActive = false;
          _activeNativeUrl = null;
          await _nativeAudioPlayer.stop();
          _publishNativeAudioState(event: 'stopped', force: true);
          break;

        case 'seek':
          final rawPosition = message['position'];
          if (rawPosition is num) {
            await _nativeAudioPlayer.seek(
              Duration(milliseconds: (rawPosition.clamp(0, 86400) * 1000).round()),
            );
          }
          _publishNativeAudioState();
          break;

        case 'volume':
          final rawVolume = message['volume'];
          if (rawVolume is num) {
            await _nativeAudioPlayer.setVolume(
              rawVolume.toDouble().clamp(0.0, 1.0).toDouble(),
            );
          }
          break;
      }
    } catch (error) {
      _publishNativeAudioState(event: 'error', message: error.toString(), force: true);
    }
  }

  void _publishNativeAudioState({String? event, String? message, bool force = false}) {
    if (!force && !_nativeAudioActive) return;
    final playerState = _nativeAudioPlayer.playerState;
    final lastCommand = _lastWebAudioCommandAt;
    final syncPlaying = lastCommand == null ||
        DateTime.now().difference(lastCommand) > const Duration(seconds: 2);
    final payload = <String, dynamic>{
      'event': event ?? 'state',
      'playing': playerState.playing,
      'position': _nativeAudioPlayer.position.inMilliseconds / 1000.0,
      'duration': (_nativeAudioPlayer.duration?.inMilliseconds ?? 0) / 1000.0,
      'processingState': playerState.processingState.name,
      'syncPlaying': syncPlaying,
    };
    if (message != null) payload['message'] = message;
    final script =
        'window.dispatchEvent(new CustomEvent("melodiya-native-audio-state", {detail: ${jsonEncode(payload)}}));';
    unawaited(_web.runJavaScript(script).catchError((_) {}));
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
    _nativeStateTimer?.cancel();
    if (_nativePlayerStateSubscription != null) unawaited(_nativePlayerStateSubscription!.cancel());
    if (_nativeErrorSubscription != null) unawaited(_nativeErrorSubscription!.cancel());
    unawaited(_nativeAudioPlayer.dispose());
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
