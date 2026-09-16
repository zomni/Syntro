using System.Data;
using System.Data.Common;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Data.Sqlite;

namespace Syntro.API.Data;

public class SqliteConnectionInterceptor : DbConnectionInterceptor
{
    public override void ConnectionOpened(DbConnection connection, ConnectionEndEventData eventData)
    {
        ApplyPragmas(connection);
        base.ConnectionOpened(connection, eventData);
    }

    public override async Task ConnectionOpenedAsync(
        DbConnection connection,
        ConnectionEndEventData eventData,
        CancellationToken cancellationToken = default)
    {
        await ApplyPragmasAsync(connection, cancellationToken);
        await base.ConnectionOpenedAsync(connection, eventData, cancellationToken);
    }

    private static void ApplyPragmas(DbConnection connection)
    {
        if (connection is not SqliteConnection sqlite)
        {
            return;
        }

        if (sqlite.State != ConnectionState.Open)
        {
            return;
        }

        try
        {
            using var command = sqlite.CreateCommand();
            command.CommandText =
                "PRAGMA journal_mode=WAL; " +
                "PRAGMA busy_timeout=10000; " +
                "PRAGMA synchronous=NORMAL; " +
                "PRAGMA foreign_keys=ON;";
            command.ExecuteNonQuery();
        }
        catch (SqliteException)
        {
            // La conexion que EF abre para comprobar la existencia de la base
            // todavia no tiene archivo (readonly): los PRAGMAs se reaplican en
            // cada conexion posterior ya arrancada, que es donde importan.
        }
    }

    private static async Task ApplyPragmasAsync(DbConnection connection, CancellationToken cancellationToken)
    {
        if (connection is not SqliteConnection sqlite)
        {
            return;
        }

        if (sqlite.State != ConnectionState.Open)
        {
            return;
        }

        try
        {
            var command = sqlite.CreateCommand();
            command.CommandText =
                "PRAGMA journal_mode=WAL; " +
                "PRAGMA busy_timeout=10000; " +
                "PRAGMA synchronous=NORMAL; " +
                "PRAGMA foreign_keys=ON;";
            await command.ExecuteNonQueryAsync(cancellationToken);
        }
        catch (SqliteException)
        {
            // Lectura de la misma exception anterior: base todavia sin crear.
        }
    }
}