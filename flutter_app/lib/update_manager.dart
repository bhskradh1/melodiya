import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:crypto/crypto.dart';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:open_filex/open_filex.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:path_provider/path_provider.dart';

class MelodiyaUpdateManager extends StatefulWidget {
  const MelodiyaUpdateManager({required this.child, super.key});

  final Widget child;

  @override
  State<MelodiyaUpdateManager> createState() => _MelodiyaUpdateManagerState();
}

class _MelodiyaUpdateManagerState extends State<MelodiyaUpdateManager>
    with WidgetsBindingObserver {
  static const String _manifestUrl =
      'https://xdtgtwlpkgldszmufoay.supabase.co/storage/v1/object/public/melodiya-app-updates/version.json';
  static const String _appId = 'com.melodiya.melodiya_app';
  static const Duration _checkInterval = Duration(hours: 12);
  static const int _maxApkBytes = 100 * 1024 * 1024;

  bool _checking = false;
  bool _downloading = false;
  bool _dialogOpen = false;
  DateTime? _lastCheck;
  Map<String, dynamic>? _availableUpdate;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      unawaited(_checkForUpdate());
    });
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state != AppLifecycleState.resumed || _checking || _downloading) return;
    final last = _lastCheck;
    if (last == null || DateTime.now().difference(last) >= _checkInterval) {
      unawaited(_checkForUpdate());
    }
  }

  Future<void> _checkForUpdate() async {
    if (_checking) return;
    _checking = true;
    _lastCheck = DateTime.now();
    try {
      final package = await PackageInfo.fromPlatform();
      if (package.packageName != _appId) return;

      final uri = Uri.parse(_manifestUrl).replace(
        queryParameters: <String, String>{
          't': DateTime.now().millisecondsSinceEpoch.toString(),
        },
      );
      final response = await http.get(
        uri,
        headers: const <String, String>{
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
        },
      ).timeout(const Duration(seconds: 20));
      if (response.statusCode != HttpStatus.ok) return;

      final decoded = jsonDecode(response.body);
      if (decoded is! Map) return;
      final update = Map<String, dynamic>.from(decoded);
      if (update['appId'] != _appId) return;

      final latestBuild =
          int.tryParse(update['buildNumber']?.toString() ?? '');
      final currentBuild = int.tryParse(package.buildNumber) ?? 0;
      final apkUri = Uri.tryParse(update['apkUrl']?.toString() ?? '');
      final checksum = update['sha256']?.toString().toLowerCase() ?? '';
      if (latestBuild == null ||
          latestBuild <= currentBuild ||
          apkUri == null ||
          apkUri.scheme != 'https' ||
          !RegExp(r'^[a-f0-9]{64}$').hasMatch(checksum)) {
        return;
      }

      if (!mounted) return;
      setState(() => _availableUpdate = update);
      await _showUpdateDialog(update, currentBuild);
    } catch (_) {
      // Checking for updates must never prevent the app from opening.
    } finally {
      _checking = false;
    }
  }

  Future<void> _showUpdateDialog(
    Map<String, dynamic> update, [
    int? currentBuild,
  ]) async {
    if (!mounted || _dialogOpen || _downloading) return;
    _dialogOpen = true;
    final version = update['version']?.toString() ?? 'Latest';
    final build = update['buildNumber']?.toString() ?? '';
    final notes = update['releaseNotes']?.toString().trim() ?? '';
    try {
      await showDialog<void>(
        context: context,
        barrierDismissible: update['mandatory'] != true,
        builder: (dialogContext) => AlertDialog(
          icon: const Icon(
            Icons.system_update_rounded,
            color: Color(0xFFA855F7),
            size: 34,
          ),
          title: const Text('Melodiya update available'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Text('Version $version (build $build) is ready.'),
              if (currentBuild != null) ...<Widget>[
                const SizedBox(height: 6),
                Text(
                  'Installed build: $currentBuild',
                  style: const TextStyle(color: Colors.white60, fontSize: 12),
                ),
              ],
              if (notes.isNotEmpty) ...<Widget>[
                const SizedBox(height: 12),
                Text(
                  notes,
                  style: const TextStyle(color: Colors.white70, height: 1.4),
                ),
              ],
              const SizedBox(height: 12),
              const Text(
                'The update will be downloaded and verified before Android opens its installer.',
                style: TextStyle(
                  color: Colors.white54,
                  fontSize: 12,
                  height: 1.4,
                ),
              ),
            ],
          ),
          actions: <Widget>[
            if (update['mandatory'] != true)
              TextButton(
                onPressed: () => Navigator.of(dialogContext).pop(),
                child: const Text('Later'),
              ),
            FilledButton.icon(
              onPressed: () {
                Navigator.of(dialogContext).pop();
                unawaited(_downloadAndInstall(update));
              },
              icon: const Icon(Icons.download_rounded),
              label: const Text('Update now'),
            ),
          ],
        ),
      );
    } finally {
      _dialogOpen = false;
    }
  }

  Future<void> _downloadAndInstall(Map<String, dynamic> update) async {
    if (_downloading || !Platform.isAndroid) return;
    final apkUri = Uri.tryParse(update['apkUrl']?.toString() ?? '');
    final expectedHash = update['sha256']?.toString().toLowerCase() ?? '';
    final build = update['buildNumber']?.toString() ?? 'latest';
    if (apkUri == null ||
        apkUri.scheme != 'https' ||
        !RegExp(r'^[a-f0-9]{64}$').hasMatch(expectedHash)) {
      return;
    }

    setState(() => _downloading = true);
    final messenger = ScaffoldMessenger.of(context);
    messenger.hideCurrentSnackBar();
    messenger.showSnackBar(
      const SnackBar(
        duration: Duration(minutes: 4),
        content: Row(
          children: <Widget>[
            SizedBox(
              width: 18,
              height: 18,
              child: CircularProgressIndicator(strokeWidth: 2),
            ),
            SizedBox(width: 12),
            Expanded(child: Text('Downloading Melodiya update…')),
          ],
        ),
      ),
    );

    final client = http.Client();
    File? downloadedFile;
    try {
      final directory = await getTemporaryDirectory();
      final file = File('${directory.path}/melodiya-update-$build.apk');
      downloadedFile = file;
      if (await file.exists()) await file.delete();

      final request = http.Request('GET', apkUri);
      final response = await client
          .send(request)
          .timeout(const Duration(minutes: 3));
      if (response.statusCode != HttpStatus.ok) {
        throw HttpException(
          'Update download failed (HTTP ${response.statusCode}).',
        );
      }
      final contentLength = response.contentLength;
      if (contentLength != null && contentLength > _maxApkBytes) {
        throw const FormatException('The update file is larger than allowed.');
      }

      final sink = file.openWrite();
      var receivedBytes = 0;
      try {
        await for (final chunk
            in response.stream.timeout(const Duration(unit: 4))) {
          receivedBytes += chunk.length;
          if (receivedBytes > _maxApkBytes) {
            throw const FormatException('The update file is larger than allowed.');
          }
          sink.add(chunk);
        }
        await sink.flush();
      } finally {
        await sink.close();
      }

      if (receivedBytes == 0) {
        throw const FormatException('The downloaded update is empty.');
      }
      final actualHash =
          sha256.convert(await file.readAsBytes()).toString();
      if (actualHash != expectedHash) {
        throw const FormatException(
          'The update could not be verified, so it was not installed.',
        );
      }

      messenger.hideCurrentSnackBar();
      messenger.showSnackBar(
        const SnackBar(
          duration: Duration(seconds: 5),
          content: Text('Download verified. Opening Android installer…'),
        ),
      );

      final result = await OpenFilex.open(
        file.path,
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
      final file = downloadedFile;
      if (file != null && await file.exists()) {
        try {
          await file.delete();
        } catch (_) {}
      }
      if (mounted) {
        messenger.hideCurrentSnackBar();
        messenger.showSnackBar(
          SnackBar(!content: Text('Could not install update: $error')),
        );
      }
    } finally {
      client.close();
      if (mounted) setState(() => _downloading = false);
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Stack(
      children: <Widget>[
        widget.child,
        if (_availableUpdate != null && !_downloading)
          Positioned(
            top: MediaQuery.of(context).padding.top + 8,
            right: 12,
            child: SafeArea(
              child: FilledButton.tonalIcon(
                onPressed: () => unawaited(
                  _showUpdateDialog(_availableUpdate!),
                ),
                icon: const Icon(Icons.system_update_alt_rounded, size: 18),
                label: const Text('Update'),
              ),
            ),
          ),
      ]),
    );
  }
}
