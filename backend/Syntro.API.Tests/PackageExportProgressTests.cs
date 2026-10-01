using System.Reflection;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Syntro.API.Controllers;
using Syntro.API.Services;

namespace Syntro.API.Tests;

public class PackageExportProgressStoreTests
{
    [Fact]
    public void Get_returns_null_when_no_export_was_started()
    {
        var store = new PackageExportProgressStore();

        Assert.Null(store.Get("someone"));
    }

    [Fact]
    public void Begin_seeds_a_prepare_stage()
    {
        var store = new PackageExportProgressStore();

        store.Begin("admin");

        var entry = store.Get("admin");
        Assert.NotNull(entry);
        Assert.Equal("prepare", entry!.Stage);
        Assert.Equal(5, entry.Percent);
        Assert.False(entry.Done);
        Assert.False(entry.Failed);
    }

    [Fact]
    public void Report_updates_stage_message_and_percent()
    {
        var store = new PackageExportProgressStore();
        store.Begin("admin");

        store.Report("admin", "zip", "Comprimiendo el paquete...", 78);

        var entry = store.Get("admin");
        Assert.NotNull(entry);
        Assert.Equal("zip", entry!.Stage);
        Assert.Equal("Comprimiendo el paquete...", entry.Message);
        Assert.Equal(78, entry.Percent);
    }

    [Fact]
    public void Report_clamps_percent_into_range()
    {
        var store = new PackageExportProgressStore();
        store.Begin("admin");

        store.Report("admin", "zip", "x", 500);
        Assert.Equal(100, store.Get("admin")!.Percent);

        store.Report("admin", "zip", "x", -20);
        Assert.Equal(0, store.Get("admin")!.Percent);
    }

    [Fact]
    public void Report_without_begin_creates_an_entry()
    {
        var store = new PackageExportProgressStore();

        store.Report("admin", "documents", "Copiando documentos...", 52);

        var entry = store.Get("admin");
        Assert.NotNull(entry);
        Assert.Equal("documents", entry!.Stage);
        Assert.Equal(52, entry.Percent);
    }

    [Fact]
    public void Report_ignores_blank_key()
    {
        var store = new PackageExportProgressStore();

        store.Report("", "zip", "x", 50);
        store.Report("   ", "zip", "x", 50);

        Assert.Null(store.Get(""));
        Assert.Null(store.Get("   "));
    }

    [Fact]
    public void Complete_marks_done_and_parks_at_generation_ceiling()
    {
        var store = new PackageExportProgressStore();
        store.Begin("admin");
        store.Report("admin", "zip", "Comprimiendo...", 90);

        store.Complete("admin");

        var entry = store.Get("admin");
        Assert.NotNull(entry);
        Assert.True(entry!.Done);
        Assert.False(entry.Failed);
        Assert.Equal("done", entry.Stage);
        Assert.Equal(92, entry.Percent);
    }

    [Fact]
    public void Fail_marks_failed_and_keeps_message()
    {
        var store = new PackageExportProgressStore();
        store.Begin("admin");

        store.Fail("admin", "No hay espacio en disco");

        var entry = store.Get("admin");
        Assert.NotNull(entry);
        Assert.True(entry!.Failed);
        Assert.False(entry.Done);
        Assert.Equal("error", entry.Stage);
        Assert.Equal("No hay espacio en disco", entry.Message);
    }

    [Fact]
    public void Entries_are_isolated_per_user()
    {
        var store = new PackageExportProgressStore();
        store.Begin("admin");
        store.Report("admin", "zip", "Comprimiendo...", 78);

        store.Begin("otro-admin");
        store.Report("otro-admin", "db", "Copiando la base de datos...", 12);

        Assert.Equal("zip", store.Get("admin")!.Stage);
        Assert.Equal("db", store.Get("otro-admin")!.Stage);
    }

    [Fact]
    public async Task Completed_entry_expires_after_the_done_window()
    {
        var store = new PackageExportProgressStore();
        store.Begin("admin");
        store.Complete("admin");
        Assert.NotNull(store.Get("admin"));

        // La ventana de "done" es de 5s; esperamos a que expire.
        await Task.Delay(TimeSpan.FromSeconds(6));

        Assert.Null(store.Get("admin"));
    }
}

public class PackageExportProgressEndpointTests
{
    [Fact]
    public void Download_progress_action_is_exposed_on_both_route_aliases()
    {
        var routes = typeof(AdminController)
            .GetMethod(nameof(AdminController.GetProjectPackageDownloadProgress))!
            .GetCustomAttributes<HttpGetAttribute>()
            .SelectMany(a => a.Template is null ? Array.Empty<string>() : new[] { a.Template })
            .ToList();

        Assert.Contains("/admin/project-package/download-progress", routes);
        Assert.Contains("/dashboard/project-package/download-progress", routes);
    }

    [Fact]
    public void Download_progress_action_requires_admin_role()
    {
        var authorize = typeof(AdminController)
            .GetMethod(nameof(AdminController.GetProjectPackageDownloadProgress))!
            .GetCustomAttributes<AuthorizeAttribute>()
            .Single();

        Assert.NotNull(authorize.Roles);
        Assert.Contains("admin", authorize.Roles!.ToLowerInvariant());
    }
}