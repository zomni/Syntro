using System.Collections.Concurrent;

namespace Syntro.API.Services;

public sealed class PackageRestoreProgress
{
    public string Stage { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
    public int Percent { get; set; }
    public bool Done { get; set; }
    public bool Failed { get; set; }
    public DateTime UpdatedAtUtc { get; set; }
}

public sealed class PackageRestoreProgressStore
{
    private static readonly TimeSpan EntryLifetime = TimeSpan.FromMinutes(30);

    private readonly ConcurrentDictionary<string, PackageRestoreProgress> _entries = new();

    public void Begin(string key)
    {
        PruneStale();
        _entries[key] = new PackageRestoreProgress
        {
            Stage = "upload",
            Message = "Subiendo archivo...",
            Percent = 5,
            UpdatedAtUtc = DateTime.UtcNow
        };
    }

    public void Report(string key, string stage, string message, int percent)
    {
        if (string.IsNullOrWhiteSpace(key))
        {
            return;
        }

        PruneStale();

        if (_entries.TryGetValue(key, out var entry))
        {
            entry.Stage = stage;
            entry.Message = message;
            entry.Percent = Math.Clamp(percent, 0, 100);
            entry.UpdatedAtUtc = DateTime.UtcNow;
        }
        else
        {
            _entries[key] = new PackageRestoreProgress
            {
                Stage = stage,
                Message = message,
                Percent = Math.Clamp(percent, 0, 100),
                UpdatedAtUtc = DateTime.UtcNow
            };
        }
    }

    public void Complete(string key)
    {
        if (_entries.TryGetValue(key, out var entry))
        {
            entry.Stage = "done";
            entry.Message = "Paquete restaurado correctamente.";
            entry.Percent = 100;
            entry.Done = true;
            entry.Failed = false;
            entry.UpdatedAtUtc = DateTime.UtcNow;
        }
    }

    public void Fail(string key, string message)
    {
        if (_entries.TryGetValue(key, out var entry))
        {
            entry.Stage = "error";
            entry.Message = message;
            entry.Failed = true;
            entry.Done = false;
            entry.UpdatedAtUtc = DateTime.UtcNow;
        }
    }

    public PackageRestoreProgress? Get(string key)
    {
        if (string.IsNullOrWhiteSpace(key))
        {
            return null;
        }

        if (_entries.TryGetValue(key, out var entry))
        {
            if (entry.Done && DateTime.UtcNow - entry.UpdatedAtUtc > TimeSpan.FromSeconds(5))
            {
                TryRemove(key);
                return null;
            }

            return entry;
        }

        return null;
    }

    private void PruneStale()
    {
        var cutoff = DateTime.UtcNow - EntryLifetime;
        foreach (var pair in _entries)
        {
            if (pair.Value.UpdatedAtUtc < cutoff)
            {
                _entries.TryRemove(pair.Key, out _);
            }
        }
    }

    private void TryRemove(string key)
    {
        _entries.TryRemove(key, out _);
    }
}