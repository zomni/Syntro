using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Syntro.API.Migrations
{
    /// <inheritdoc />
    public partial class InitialCreate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "AuditLogEntries",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    BuildingExternalId = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    EntityType = table.Column<string>(type: "TEXT", maxLength: 50, nullable: false),
                    EntityId = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    ActionType = table.Column<string>(type: "TEXT", maxLength: 50, nullable: false),
                    Resource = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    Result = table.Column<string>(type: "TEXT", maxLength: 50, nullable: false),
                    Severity = table.Column<string>(type: "TEXT", maxLength: 30, nullable: false),
                    Summary = table.Column<string>(type: "TEXT", maxLength: 300, nullable: false),
                    Details = table.Column<string>(type: "TEXT", maxLength: 1000, nullable: false),
                    PreviousValue = table.Column<string>(type: "TEXT", maxLength: 1000, nullable: false),
                    NewValue = table.Column<string>(type: "TEXT", maxLength: 1000, nullable: false),
                    ChangedByUsername = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    ClientIp = table.Column<string>(type: "TEXT", maxLength: 80, nullable: false),
                    UserAgent = table.Column<string>(type: "TEXT", maxLength: 300, nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: false),
                    UpdatedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: false),
                    DeletedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: true),
                    CreatedBy = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    UpdatedBy = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    DeletedBy = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    Version = table.Column<int>(type: "INTEGER", nullable: false),
                    IsActive = table.Column<bool>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AuditLogEntries", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "AuthUsers",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    Username = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    NormalizedUsername = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    PasswordHash = table.Column<string>(type: "TEXT", maxLength: 500, nullable: false),
                    Role = table.Column<string>(type: "TEXT", maxLength: 20, nullable: false),
                    MfaEnabled = table.Column<bool>(type: "INTEGER", nullable: false),
                    MfaSecretProtected = table.Column<string>(type: "TEXT", maxLength: 1000, nullable: false),
                    MfaEnrolledAtUtc = table.Column<DateTime>(type: "TEXT", nullable: true),
                    MfaLastVerifiedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: true),
                    CanManageUsers = table.Column<bool>(type: "INTEGER", nullable: false),
                    FailedLoginAttempts = table.Column<int>(type: "INTEGER", nullable: false),
                    LockedUntilUtc = table.Column<DateTime>(type: "TEXT", nullable: true),
                    LastLoginAtUtc = table.Column<DateTime>(type: "TEXT", nullable: true),
                    CreatedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: false),
                    UpdatedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: false),
                    DeletedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: true),
                    CreatedBy = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    UpdatedBy = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    DeletedBy = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    Version = table.Column<int>(type: "INTEGER", nullable: false),
                    IsActive = table.Column<bool>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AuthUsers", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "BackupHistories",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    Status = table.Column<string>(type: "TEXT", maxLength: 30, nullable: false),
                    FilePath = table.Column<string>(type: "TEXT", maxLength: 500, nullable: false),
                    SizeBytes = table.Column<long>(type: "INTEGER", nullable: false),
                    Hash = table.Column<string>(type: "TEXT", maxLength: 128, nullable: false),
                    ErrorMessage = table.Column<string>(type: "TEXT", maxLength: 1000, nullable: false),
                    Reason = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: false),
                    UpdatedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: false),
                    DeletedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: true),
                    CreatedBy = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    UpdatedBy = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    DeletedBy = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    Version = table.Column<int>(type: "INTEGER", nullable: false),
                    IsActive = table.Column<bool>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BackupHistories", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "BuildingGeometryOverrides",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    BuildingExternalId = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    GeometryJson = table.Column<string>(type: "TEXT", nullable: false),
                    CentroidLatitude = table.Column<double>(type: "REAL", nullable: true),
                    CentroidLongitude = table.Column<double>(type: "REAL", nullable: true),
                    CreatedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: false),
                    UpdatedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: false),
                    DeletedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: true),
                    CreatedBy = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    UpdatedBy = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    DeletedBy = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    Version = table.Column<int>(type: "INTEGER", nullable: false),
                    IsActive = table.Column<bool>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BuildingGeometryOverrides", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "ImportedInventoryItems",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    RowNumber = table.Column<int>(type: "INTEGER", nullable: false),
                    ItemNumber = table.Column<string>(type: "TEXT", maxLength: 50, nullable: false),
                    SerialNumber = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    Description = table.Column<string>(type: "TEXT", maxLength: 500, nullable: false),
                    Lot = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    InstallDate = table.Column<string>(type: "TEXT", maxLength: 50, nullable: false),
                    UnitOrDepartment = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    OrganizationalUnit = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    ResponsibleUser = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    Run = table.Column<string>(type: "TEXT", maxLength: 50, nullable: false),
                    Email = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    JobTitle = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    IpAddress = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    MacAddress = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    AnnexPhone = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    ReplacedEquipment = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    TicketMda = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    Installer = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    Observation = table.Column<string>(type: "TEXT", maxLength: 500, nullable: false),
                    Rut = table.Column<string>(type: "TEXT", maxLength: 50, nullable: false),
                    InventoryDate = table.Column<string>(type: "TEXT", maxLength: 50, nullable: false),
                    InferredCategory = table.Column<string>(type: "TEXT", maxLength: 50, nullable: false),
                    InferredStatus = table.Column<string>(type: "TEXT", maxLength: 50, nullable: false),
                    MatchedSyncedBuildingId = table.Column<Guid>(type: "TEXT", nullable: true),
                    MatchedSyncedRoomId = table.Column<Guid>(type: "TEXT", nullable: true),
                    MatchedBuildingExternalId = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    MatchedRoomExternalId = table.Column<string>(type: "TEXT", maxLength: 120, nullable: false),
                    MatchConfidence = table.Column<string>(type: "TEXT", maxLength: 50, nullable: false),
                    MatchNotes = table.Column<string>(type: "TEXT", maxLength: 500, nullable: false),
                    AssignedBuildingExternalId = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    AssignedRoomExternalId = table.Column<string>(type: "TEXT", maxLength: 120, nullable: false),
                    AssignedFloor = table.Column<int>(type: "INTEGER", nullable: true),
                    AssignmentNotes = table.Column<string>(type: "TEXT", maxLength: 500, nullable: false),
                    AssignmentUpdatedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: true),
                    DeliveryFormPdfFileName = table.Column<string>(type: "TEXT", nullable: false),
                    SourceFile = table.Column<string>(type: "TEXT", maxLength: 260, nullable: false),
                    ImportedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: false),
                    UpdatedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: false),
                    DeletedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: true),
                    CreatedBy = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    UpdatedBy = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    DeletedBy = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    Version = table.Column<int>(type: "INTEGER", nullable: false),
                    IsActive = table.Column<bool>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ImportedInventoryItems", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "InventoryAliasRules",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    SourceText = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    NormalizedSourceText = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    TargetBuildingExternalId = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    TargetRoomExternalId = table.Column<string>(type: "TEXT", maxLength: 120, nullable: false),
                    IsEnabled = table.Column<bool>(type: "INTEGER", nullable: false),
                    Notes = table.Column<string>(type: "TEXT", maxLength: 500, nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: false),
                    UpdatedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: false),
                    DeletedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: true),
                    CreatedBy = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    UpdatedBy = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    DeletedBy = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    Version = table.Column<int>(type: "INTEGER", nullable: false),
                    IsActive = table.Column<bool>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_InventoryAliasRules", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Locations",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    Name = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    Description = table.Column<string>(type: "TEXT", nullable: false),
                    Latitude = table.Column<double>(type: "REAL", nullable: false),
                    Longitude = table.Column<double>(type: "REAL", nullable: false),
                    Floor = table.Column<string>(type: "TEXT", maxLength: 10, nullable: false),
                    Campus = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    Type = table.Column<string>(type: "TEXT", maxLength: 50, nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: false),
                    UpdatedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: false),
                    DeletedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: true),
                    CreatedBy = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    UpdatedBy = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    DeletedBy = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    Version = table.Column<int>(type: "INTEGER", nullable: false),
                    IsActive = table.Column<bool>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Locations", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "ManualBuildings",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    ExternalId = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    Campus = table.Column<string>(type: "TEXT", maxLength: 50, nullable: false),
                    DisplayName = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    Type = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    Notes = table.Column<string>(type: "TEXT", maxLength: 1000, nullable: false),
                    FloorsJson = table.Column<string>(type: "TEXT", maxLength: 500, nullable: false),
                    GeometryJson = table.Column<string>(type: "TEXT", nullable: false),
                    CentroidLatitude = table.Column<double>(type: "REAL", nullable: true),
                    CentroidLongitude = table.Column<double>(type: "REAL", nullable: true),
                    CreatedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: false),
                    UpdatedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: false),
                    DeletedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: true),
                    CreatedBy = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    UpdatedBy = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    DeletedBy = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    Version = table.Column<int>(type: "INTEGER", nullable: false),
                    IsActive = table.Column<bool>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ManualBuildings", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "NetworkTelemetrySnapshots",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    SourceName = table.Column<string>(type: "TEXT", maxLength: 120, nullable: false),
                    SourceType = table.Column<string>(type: "TEXT", maxLength: 80, nullable: false),
                    Status = table.Column<string>(type: "TEXT", maxLength: 30, nullable: false),
                    RiskLevel = table.Column<string>(type: "TEXT", maxLength: 30, nullable: false),
                    RiskScore = table.Column<int>(type: "INTEGER", nullable: false),
                    DeviceCount = table.Column<int>(type: "INTEGER", nullable: false),
                    ConnectedUserCount = table.Column<int>(type: "INTEGER", nullable: false),
                    HighRiskDeviceCount = table.Column<int>(type: "INTEGER", nullable: false),
                    MediumRiskDeviceCount = table.Column<int>(type: "INTEGER", nullable: false),
                    LowRiskDeviceCount = table.Column<int>(type: "INTEGER", nullable: false),
                    ObservedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: false),
                    WindowStartUtc = table.Column<DateTime>(type: "TEXT", nullable: true),
                    WindowEndUtc = table.Column<DateTime>(type: "TEXT", nullable: true),
                    Notes = table.Column<string>(type: "TEXT", maxLength: 500, nullable: false),
                    PayloadJson = table.Column<string>(type: "TEXT", nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: false),
                    UpdatedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: false),
                    DeletedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: true),
                    CreatedBy = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    UpdatedBy = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    DeletedBy = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    Version = table.Column<int>(type: "INTEGER", nullable: false),
                    IsActive = table.Column<bool>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_NetworkTelemetrySnapshots", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "SyncedBuildings",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    ExternalId = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    Campus = table.Column<string>(type: "TEXT", maxLength: 50, nullable: false),
                    ManualCampus = table.Column<string>(type: "TEXT", maxLength: 50, nullable: false),
                    Slug = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    DisplayName = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    ManualDisplayName = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    ShortName = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    RealName = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    Type = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    ResponsibleArea = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    Notes = table.Column<string>(type: "TEXT", nullable: false),
                    SourceId = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    CentroidLatitude = table.Column<double>(type: "REAL", nullable: true),
                    CentroidLongitude = table.Column<double>(type: "REAL", nullable: true),
                    HasInteriorMap = table.Column<bool>(type: "INTEGER", nullable: false),
                    HasInventory = table.Column<bool>(type: "INTEGER", nullable: false),
                    MappingStatus = table.Column<string>(type: "TEXT", nullable: false),
                    InventoryStatus = table.Column<string>(type: "TEXT", nullable: false),
                    OperationalNotes = table.Column<string>(type: "TEXT", nullable: false),
                    TechnicalNotes = table.Column<string>(type: "TEXT", nullable: false),
                    LastUpdate = table.Column<string>(type: "TEXT", nullable: false),
                    FloorsJson = table.Column<string>(type: "TEXT", nullable: false),
                    ManualFloorsJson = table.Column<string>(type: "TEXT", maxLength: 500, nullable: false),
                    FloorSummariesJson = table.Column<string>(type: "TEXT", nullable: false),
                    TagsJson = table.Column<string>(type: "TEXT", nullable: false),
                    ContactsJson = table.Column<string>(type: "TEXT", nullable: false),
                    SyncedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: false),
                    UpdatedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: false),
                    DeletedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: true),
                    CreatedBy = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    UpdatedBy = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    DeletedBy = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    Version = table.Column<int>(type: "INTEGER", nullable: false),
                    IsActive = table.Column<bool>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SyncedBuildings", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "WalkingRouteEdges",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    ExternalId = table.Column<string>(type: "TEXT", maxLength: 120, nullable: false),
                    Campus = table.Column<string>(type: "TEXT", maxLength: 50, nullable: false),
                    FromNodeExternalId = table.Column<string>(type: "TEXT", maxLength: 120, nullable: false),
                    ToNodeExternalId = table.Column<string>(type: "TEXT", maxLength: 120, nullable: false),
                    DistanceMeters = table.Column<double>(type: "REAL", nullable: false),
                    Status = table.Column<string>(type: "TEXT", maxLength: 30, nullable: false),
                    Notes = table.Column<string>(type: "TEXT", maxLength: 500, nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: false),
                    UpdatedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: false),
                    DeletedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: true),
                    CreatedBy = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    UpdatedBy = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    DeletedBy = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    Version = table.Column<int>(type: "INTEGER", nullable: false),
                    IsActive = table.Column<bool>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WalkingRouteEdges", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "WalkingRouteNodes",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    ExternalId = table.Column<string>(type: "TEXT", maxLength: 120, nullable: false),
                    Campus = table.Column<string>(type: "TEXT", maxLength: 50, nullable: false),
                    Latitude = table.Column<double>(type: "REAL", nullable: false),
                    Longitude = table.Column<double>(type: "REAL", nullable: false),
                    Notes = table.Column<string>(type: "TEXT", maxLength: 500, nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: false),
                    UpdatedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: false),
                    DeletedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: true),
                    CreatedBy = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    UpdatedBy = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    DeletedBy = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    Version = table.Column<int>(type: "INTEGER", nullable: false),
                    IsActive = table.Column<bool>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_WalkingRouteNodes", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Equipments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    Name = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    Category = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    SerialNumber = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    Status = table.Column<string>(type: "TEXT", maxLength: 50, nullable: false),
                    Notes = table.Column<string>(type: "TEXT", nullable: true),
                    LocationId = table.Column<Guid>(type: "TEXT", nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: false),
                    UpdatedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: false),
                    DeletedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: true),
                    CreatedBy = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    UpdatedBy = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    DeletedBy = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    Version = table.Column<int>(type: "INTEGER", nullable: false),
                    IsActive = table.Column<bool>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Equipments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_Equipments_Locations_LocationId",
                        column: x => x.LocationId,
                        principalTable: "Locations",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "NetworkTelemetryObservations",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    NetworkTelemetrySnapshotId = table.Column<Guid>(type: "TEXT", nullable: false),
                    ObservationType = table.Column<string>(type: "TEXT", maxLength: 40, nullable: false),
                    ExternalKey = table.Column<string>(type: "TEXT", maxLength: 120, nullable: false),
                    DeviceName = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    Username = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    Domain = table.Column<string>(type: "TEXT", maxLength: 80, nullable: false),
                    IpAddress = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    MacAddress = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    SerialNumber = table.Column<string>(type: "TEXT", maxLength: 120, nullable: false),
                    HostName = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    DeviceCategory = table.Column<string>(type: "TEXT", maxLength: 60, nullable: false),
                    OperatingSystem = table.Column<string>(type: "TEXT", maxLength: 120, nullable: false),
                    OperatingSystemVersion = table.Column<string>(type: "TEXT", maxLength: 120, nullable: false),
                    Manufacturer = table.Column<string>(type: "TEXT", maxLength: 120, nullable: false),
                    Model = table.Column<string>(type: "TEXT", maxLength: 160, nullable: false),
                    Processor = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    MemoryGb = table.Column<double>(type: "REAL", nullable: true),
                    DiskTotalGb = table.Column<double>(type: "REAL", nullable: true),
                    DiskFreeGb = table.Column<double>(type: "REAL", nullable: true),
                    LastBootAtUtc = table.Column<DateTime>(type: "TEXT", nullable: true),
                    IsOnline = table.Column<bool>(type: "INTEGER", nullable: true),
                    DomainJoined = table.Column<bool>(type: "INTEGER", nullable: true),
                    IsVirtualMachine = table.Column<bool>(type: "INTEGER", nullable: true),
                    PingMs = table.Column<int>(type: "INTEGER", nullable: true),
                    AntivirusStatus = table.Column<string>(type: "TEXT", maxLength: 80, nullable: false),
                    AntivirusVersion = table.Column<string>(type: "TEXT", maxLength: 120, nullable: false),
                    PatchStatus = table.Column<string>(type: "TEXT", maxLength: 80, nullable: false),
                    AgentVersion = table.Column<string>(type: "TEXT", maxLength: 80, nullable: false),
                    OpenPorts = table.Column<string>(type: "TEXT", maxLength: 300, nullable: false),
                    SubnetCidr = table.Column<string>(type: "TEXT", maxLength: 40, nullable: false),
                    NetworkProfile = table.Column<string>(type: "TEXT", maxLength: 80, nullable: false),
                    BuildingExternalId = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    RoomExternalId = table.Column<string>(type: "TEXT", maxLength: 120, nullable: false),
                    ImportedInventoryItemId = table.Column<Guid>(type: "TEXT", nullable: true),
                    SyncedEquipmentId = table.Column<Guid>(type: "TEXT", nullable: true),
                    AuthUserId = table.Column<Guid>(type: "TEXT", nullable: true),
                    Status = table.Column<string>(type: "TEXT", maxLength: 40, nullable: false),
                    RiskLevel = table.Column<string>(type: "TEXT", maxLength: 40, nullable: false),
                    RiskScore = table.Column<int>(type: "INTEGER", nullable: false),
                    RiskReasonsJson = table.Column<string>(type: "TEXT", maxLength: 2000, nullable: false),
                    RawJson = table.Column<string>(type: "TEXT", maxLength: 8000, nullable: false),
                    ObservedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: false),
                    UpdatedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: false),
                    DeletedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: true),
                    CreatedBy = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    UpdatedBy = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    DeletedBy = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    Version = table.Column<int>(type: "INTEGER", nullable: false),
                    IsActive = table.Column<bool>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_NetworkTelemetryObservations", x => x.Id);
                    table.ForeignKey(
                        name: "FK_NetworkTelemetryObservations_NetworkTelemetrySnapshots_NetworkTelemetrySnapshotId",
                        column: x => x.NetworkTelemetrySnapshotId,
                        principalTable: "NetworkTelemetrySnapshots",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "ScheduledScanRuns",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    ScheduledAtUtc = table.Column<DateTime>(type: "TEXT", nullable: false),
                    StartedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: true),
                    CompletedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: true),
                    Status = table.Column<string>(type: "TEXT", maxLength: 20, nullable: false),
                    ErrorMessage = table.Column<string>(type: "TEXT", maxLength: 2000, nullable: true),
                    SnapshotId = table.Column<Guid>(type: "TEXT", nullable: true),
                    ScheduledTimeLocal = table.Column<string>(type: "TEXT", maxLength: 10, nullable: false),
                    ScheduledDayLocal = table.Column<string>(type: "TEXT", maxLength: 15, nullable: false),
                    DeviceCount = table.Column<int>(type: "INTEGER", nullable: true),
                    UserCount = table.Column<int>(type: "INTEGER", nullable: true),
                    NormalizedCron = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: false),
                    UpdatedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: false),
                    DeletedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: true),
                    CreatedBy = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    UpdatedBy = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    DeletedBy = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    Version = table.Column<int>(type: "INTEGER", nullable: false),
                    IsActive = table.Column<bool>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ScheduledScanRuns", x => x.Id);
                    table.ForeignKey(
                        name: "FK_ScheduledScanRuns_NetworkTelemetrySnapshots_SnapshotId",
                        column: x => x.SnapshotId,
                        principalTable: "NetworkTelemetrySnapshots",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateTable(
                name: "SyncedRooms",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    ExternalId = table.Column<string>(type: "TEXT", maxLength: 120, nullable: false),
                    SyncedBuildingId = table.Column<Guid>(type: "TEXT", nullable: false),
                    BuildingExternalId = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    Floor = table.Column<int>(type: "INTEGER", nullable: false),
                    ManualFloor = table.Column<int>(type: "INTEGER", nullable: true),
                    Name = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    ManualName = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    ShortName = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    Type = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    Sector = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    Unit = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    Service = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    IsMapped = table.Column<bool>(type: "INTEGER", nullable: false),
                    GeometryJson = table.Column<string>(type: "TEXT", nullable: false),
                    Status = table.Column<string>(type: "TEXT", maxLength: 50, nullable: false),
                    Capacity = table.Column<int>(type: "INTEGER", nullable: true),
                    DevicesCount = table.Column<int>(type: "INTEGER", nullable: false),
                    ResponsibleArea = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    ResponsiblePerson = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    Notes = table.Column<string>(type: "TEXT", nullable: false),
                    SyncedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: false),
                    UpdatedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: false),
                    DeletedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: true),
                    CreatedBy = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    UpdatedBy = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    DeletedBy = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    Version = table.Column<int>(type: "INTEGER", nullable: false),
                    IsActive = table.Column<bool>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SyncedRooms", x => x.Id);
                    table.ForeignKey(
                        name: "FK_SyncedRooms_SyncedBuildings_SyncedBuildingId",
                        column: x => x.SyncedBuildingId,
                        principalTable: "SyncedBuildings",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "SyncedEquipments",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    ExternalId = table.Column<string>(type: "TEXT", maxLength: 120, nullable: false),
                    SyncedBuildingId = table.Column<Guid>(type: "TEXT", nullable: false),
                    SyncedRoomId = table.Column<Guid>(type: "TEXT", nullable: true),
                    BuildingExternalId = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    RoomExternalId = table.Column<string>(type: "TEXT", maxLength: 120, nullable: false),
                    Floor = table.Column<int>(type: "INTEGER", nullable: true),
                    Type = table.Column<string>(type: "TEXT", maxLength: 50, nullable: false),
                    Subtype = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    Name = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    InventoryCode = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    SerialNumber = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    Brand = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    Model = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    IpAddress = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    MacAddress = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    AssignedTo = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    ResponsiblePerson = table.Column<string>(type: "TEXT", maxLength: 200, nullable: false),
                    Status = table.Column<string>(type: "TEXT", maxLength: 50, nullable: false),
                    NetworkStatus = table.Column<string>(type: "TEXT", maxLength: 50, nullable: false),
                    LastSeen = table.Column<string>(type: "TEXT", maxLength: 50, nullable: false),
                    PurchaseDate = table.Column<string>(type: "TEXT", maxLength: 50, nullable: false),
                    Notes = table.Column<string>(type: "TEXT", nullable: false),
                    HistoryJson = table.Column<string>(type: "TEXT", nullable: false),
                    Source = table.Column<string>(type: "TEXT", maxLength: 50, nullable: false),
                    SyncedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: false),
                    CreatedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: false),
                    UpdatedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: false),
                    DeletedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: true),
                    CreatedBy = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    UpdatedBy = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    DeletedBy = table.Column<string>(type: "TEXT", maxLength: 100, nullable: false),
                    Version = table.Column<int>(type: "INTEGER", nullable: false),
                    IsActive = table.Column<bool>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_SyncedEquipments", x => x.Id);
                    table.ForeignKey(
                        name: "FK_SyncedEquipments_SyncedBuildings_SyncedBuildingId",
                        column: x => x.SyncedBuildingId,
                        principalTable: "SyncedBuildings",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_SyncedEquipments_SyncedRooms_SyncedRoomId",
                        column: x => x.SyncedRoomId,
                        principalTable: "SyncedRooms",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.SetNull);
                });

            migrationBuilder.CreateIndex(
                name: "IX_AuditLogEntries_BuildingExternalId_CreatedAtUtc",
                table: "AuditLogEntries",
                columns: new[] { "BuildingExternalId", "CreatedAtUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_AuthUsers_NormalizedUsername",
                table: "AuthUsers",
                column: "NormalizedUsername",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_BackupHistories_CreatedAtUtc",
                table: "BackupHistories",
                column: "CreatedAtUtc");

            migrationBuilder.CreateIndex(
                name: "IX_BuildingGeometryOverrides_BuildingExternalId",
                table: "BuildingGeometryOverrides",
                column: "BuildingExternalId",
                unique: true,
                filter: "\"BuildingExternalId\" IS NOT NULL AND \"DeletedAtUtc\" IS NULL");

            migrationBuilder.CreateIndex(
                name: "IX_Equipments_LocationId",
                table: "Equipments",
                column: "LocationId");

            migrationBuilder.CreateIndex(
                name: "IX_ImportedInventoryItems_AssignedBuildingExternalId",
                table: "ImportedInventoryItems",
                column: "AssignedBuildingExternalId");

            migrationBuilder.CreateIndex(
                name: "IX_ImportedInventoryItems_AssignedRoomExternalId",
                table: "ImportedInventoryItems",
                column: "AssignedRoomExternalId");

            migrationBuilder.CreateIndex(
                name: "IX_ImportedInventoryItems_SourceFile_RowNumber",
                table: "ImportedInventoryItems",
                columns: new[] { "SourceFile", "RowNumber" },
                unique: true,
                filter: "\"DeletedAtUtc\" IS NULL");

            migrationBuilder.CreateIndex(
                name: "IX_InventoryAliasRules_NormalizedSourceText",
                table: "InventoryAliasRules",
                column: "NormalizedSourceText",
                unique: true,
                filter: "\"NormalizedSourceText\" IS NOT NULL AND \"DeletedAtUtc\" IS NULL");

            migrationBuilder.CreateIndex(
                name: "IX_ManualBuildings_ExternalId",
                table: "ManualBuildings",
                column: "ExternalId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_NetworkTelemetryObservations_IpAddress",
                table: "NetworkTelemetryObservations",
                column: "IpAddress");

            migrationBuilder.CreateIndex(
                name: "IX_NetworkTelemetryObservations_MacAddress",
                table: "NetworkTelemetryObservations",
                column: "MacAddress");

            migrationBuilder.CreateIndex(
                name: "IX_NetworkTelemetryObservations_NetworkTelemetrySnapshotId",
                table: "NetworkTelemetryObservations",
                column: "NetworkTelemetrySnapshotId");

            migrationBuilder.CreateIndex(
                name: "IX_NetworkTelemetryObservations_ObservationType_RiskLevel",
                table: "NetworkTelemetryObservations",
                columns: new[] { "ObservationType", "RiskLevel" });

            migrationBuilder.CreateIndex(
                name: "IX_NetworkTelemetryObservations_ObservedAtUtc",
                table: "NetworkTelemetryObservations",
                column: "ObservedAtUtc");

            migrationBuilder.CreateIndex(
                name: "IX_NetworkTelemetryObservations_SerialNumber",
                table: "NetworkTelemetryObservations",
                column: "SerialNumber");

            migrationBuilder.CreateIndex(
                name: "IX_NetworkTelemetryObservations_SubnetCidr",
                table: "NetworkTelemetryObservations",
                column: "SubnetCidr");

            migrationBuilder.CreateIndex(
                name: "IX_NetworkTelemetryObservations_Username",
                table: "NetworkTelemetryObservations",
                column: "Username");

            migrationBuilder.CreateIndex(
                name: "IX_NetworkTelemetrySnapshots_ObservedAtUtc",
                table: "NetworkTelemetrySnapshots",
                column: "ObservedAtUtc");

            migrationBuilder.CreateIndex(
                name: "IX_NetworkTelemetrySnapshots_SourceName_ObservedAtUtc",
                table: "NetworkTelemetrySnapshots",
                columns: new[] { "SourceName", "ObservedAtUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_ScheduledScanRuns_ScheduledAtUtc",
                table: "ScheduledScanRuns",
                column: "ScheduledAtUtc");

            migrationBuilder.CreateIndex(
                name: "IX_ScheduledScanRuns_SnapshotId",
                table: "ScheduledScanRuns",
                column: "SnapshotId");

            migrationBuilder.CreateIndex(
                name: "IX_ScheduledScanRuns_Status",
                table: "ScheduledScanRuns",
                column: "Status");

            migrationBuilder.CreateIndex(
                name: "IX_SyncedBuildings_ExternalId",
                table: "SyncedBuildings",
                column: "ExternalId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SyncedEquipments_BuildingExternalId",
                table: "SyncedEquipments",
                column: "BuildingExternalId");

            migrationBuilder.CreateIndex(
                name: "IX_SyncedEquipments_ExternalId",
                table: "SyncedEquipments",
                column: "ExternalId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SyncedEquipments_RoomExternalId",
                table: "SyncedEquipments",
                column: "RoomExternalId");

            migrationBuilder.CreateIndex(
                name: "IX_SyncedEquipments_SyncedBuildingId",
                table: "SyncedEquipments",
                column: "SyncedBuildingId");

            migrationBuilder.CreateIndex(
                name: "IX_SyncedEquipments_SyncedRoomId",
                table: "SyncedEquipments",
                column: "SyncedRoomId");

            migrationBuilder.CreateIndex(
                name: "IX_SyncedRooms_ExternalId",
                table: "SyncedRooms",
                column: "ExternalId",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_SyncedRooms_SyncedBuildingId_Floor",
                table: "SyncedRooms",
                columns: new[] { "SyncedBuildingId", "Floor" });

            migrationBuilder.CreateIndex(
                name: "IX_WalkingRouteEdges_Campus",
                table: "WalkingRouteEdges",
                column: "Campus");

            migrationBuilder.CreateIndex(
                name: "IX_WalkingRouteEdges_ExternalId",
                table: "WalkingRouteEdges",
                column: "ExternalId",
                unique: true,
                filter: "\"ExternalId\" IS NOT NULL AND \"DeletedAtUtc\" IS NULL");

            migrationBuilder.CreateIndex(
                name: "IX_WalkingRouteEdges_FromNodeExternalId",
                table: "WalkingRouteEdges",
                column: "FromNodeExternalId");

            migrationBuilder.CreateIndex(
                name: "IX_WalkingRouteEdges_ToNodeExternalId",
                table: "WalkingRouteEdges",
                column: "ToNodeExternalId");

            migrationBuilder.CreateIndex(
                name: "IX_WalkingRouteNodes_ExternalId",
                table: "WalkingRouteNodes",
                column: "ExternalId",
                unique: true,
                filter: "\"ExternalId\" IS NOT NULL AND \"DeletedAtUtc\" IS NULL");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "AuditLogEntries");

            migrationBuilder.DropTable(
                name: "AuthUsers");

            migrationBuilder.DropTable(
                name: "BackupHistories");

            migrationBuilder.DropTable(
                name: "BuildingGeometryOverrides");

            migrationBuilder.DropTable(
                name: "Equipments");

            migrationBuilder.DropTable(
                name: "ImportedInventoryItems");

            migrationBuilder.DropTable(
                name: "InventoryAliasRules");

            migrationBuilder.DropTable(
                name: "ManualBuildings");

            migrationBuilder.DropTable(
                name: "NetworkTelemetryObservations");

            migrationBuilder.DropTable(
                name: "ScheduledScanRuns");

            migrationBuilder.DropTable(
                name: "SyncedEquipments");

            migrationBuilder.DropTable(
                name: "WalkingRouteEdges");

            migrationBuilder.DropTable(
                name: "WalkingRouteNodes");

            migrationBuilder.DropTable(
                name: "Locations");

            migrationBuilder.DropTable(
                name: "NetworkTelemetrySnapshots");

            migrationBuilder.DropTable(
                name: "SyncedRooms");

            migrationBuilder.DropTable(
                name: "SyncedBuildings");
        }
    }
}
