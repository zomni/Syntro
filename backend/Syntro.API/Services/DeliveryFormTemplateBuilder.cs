using System.IO.Compression;
using System.Xml.Linq;

namespace Syntro.API.Services;

public static class DeliveryFormTemplateBuilder
{
    private static readonly XNamespace W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
    private static readonly XNamespace Ct = "http://schemas.openxmlformats.org/package/2006/content-types";
    private static readonly XNamespace PackageRelationships = "http://schemas.openxmlformats.org/package/2006/relationships";
    private static readonly XNamespace DocumentRelationships = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
    private static readonly XNamespace Cp = "http://schemas.openxmlformats.org/package/2006/metadata/core-properties";
    private static readonly XNamespace Dc = "http://purl.org/dc/elements/1.1/";
    private static readonly XNamespace Dcterms = "http://purl.org/dc/terms/";
    private static readonly XNamespace Xsi = "http://www.w3.org/2001/XMLSchema-instance";
    private static readonly XNamespace ExtendedProperties = "http://schemas.openxmlformats.org/officeDocument/2006/extended-properties";

    public static byte[] BuildGenericTemplate(IConfiguration configuration)
    {
        var sections = DeliveryFormChecklistConfig.GetSections(configuration);
        var firstSection = sections.Count > 0 ? sections[0] : null;
        var secondSection = sections.Count > 1 ? sections[1] : null;
        var itemRows = Math.Max(
            Math.Max(firstSection?.Items.Count ?? 0, secondSection?.Items.Count ?? 0),
            9);

        using var archiveStream = new MemoryStream();
        using (var archive = new ZipArchive(archiveStream, ZipArchiveMode.Create, true))
        {
            AddEntry(archive, "[Content_Types].xml", BuildContentTypes());
            AddEntry(archive, "_rels/.rels", BuildRootRelationships());
            AddEntry(archive, "word/document.xml", BuildDocument(firstSection, secondSection, itemRows));
            AddEntry(archive, "word/_rels/document.xml.rels", BuildDocumentRelationships());
            AddEntry(archive, "word/styles.xml", BuildStyles());
            AddEntry(archive, "docProps/core.xml", BuildCoreProperties());
            AddEntry(archive, "docProps/app.xml", BuildAppProperties());
        }

        return archiveStream.ToArray();
    }

    private static XDocument BuildDocument(DeliveryFormChecklistSection? firstSection, DeliveryFormChecklistSection? secondSection, int itemRows)
    {
        var body = new XElement(W + "body",
            BuildParagraph("FORMULARIO DE ENTREGA DE EQUIPO", bold: true, centered: true, fontSize: 28),
            BuildParagraph("Generado por Syntro", bold: false, centered: true, fontSize: 18),
            BuildSpacerParagraph(),
            BuildTable(BuildHeaderRows(), [2500, 2500, 2500, 2500], column => column == 0 || column == 2),
            BuildSpacerParagraph(),
            BuildTable(BuildComputerRows(), [2500, 2500, 2500, 2500], column => column == 0 || column == 2),
            BuildSpacerParagraph(),
            BuildTable(BuildPeripheralRows(), [2500, 7500], column => column == 0),
            BuildSpacerParagraph(),
            BuildTable(BuildApplicationsRows(firstSection, secondSection, itemRows), [1700, 500, 400, 1700, 500, 400, 2300, 2300], column => column == 0 || column == 3 || column == 6),
            BuildSpacerParagraph(),
            BuildParagraph("Declaro recibir con esta fecha el equipo descrito en este formulario y en buen estado de funcionamiento.", fontSize: 18),
            BuildParagraph("FIRMA USUARIO", bold: true, fontSize: 18),
            BuildSignatureLineParagraph(),
            BuildParagraph("RUT: ", fontSize: 18),
            BuildParagraph("FIRMA TECNICO", bold: true, fontSize: 18),
            BuildParagraph("Me comprometo a:", bold: true, fontSize: 18),
            BuildParagraph("CAP01 - Cumplir con el resguardo y cuidado del equipo asignado.", fontSize: 18),
            new XElement(W + "sectPr",
                new XElement(W + "pgSz", new XAttribute(W + "w", "11906"), new XAttribute(W + "h", "16838")),
                new XElement(W + "pgMar",
                    new XAttribute(W + "top", "720"),
                    new XAttribute(W + "right", "720"),
                    new XAttribute(W + "bottom", "720"),
                    new XAttribute(W + "left", "720"),
                    new XAttribute(W + "header", "720"),
                    new XAttribute(W + "footer", "720"),
                    new XAttribute(W + "gutter", "0"))));

        return new XDocument(new XElement(W + "document", body));
    }

    private static IReadOnlyList<IReadOnlyList<string>> BuildHeaderRows()
    {
        return
        [
            ["INSTITUCION", "", "FECHA", ""],
            ["UNIDAD O DEPARTAMENTO", "", "", ""],
            ["NUMERO DE SERIE", "", "", ""],
            ["USUARIO RESPONSABLE", "", "", ""],
            ["CORREO ELECTRONICO", "", "IP", ""],
            ["CARGO", "", "ANEXO", ""],
            ["USUARIO ACTIVE DIRECTORY", "", "", ""],
            ["", "", "BRECHA", ""],
            ["", "", "SERIE / INVENTARIO EQUIPO REEMPLAZADO", ""],
            ["", "", "MARCA Y MODELO EQUIPO REEMPLAZADO", ""],
            ["", "", "CORREO ACTIVACION OFFICE / PROVEEDOR", ""],
            ["", "", "MDA - INSTA", ""],
            ["", "", "MAC ADDR", ""]
        ];
    }

    private static IReadOnlyList<IReadOnlyList<string>> BuildComputerRows()
    {
        return
        [
            ["DATOS TECNICOS DEL EQUIPO", "", "", ""],
            ["MARCA", "", "SISTEMA OPERATIVO", ""],
            ["MODELO", "", "SUITE MS OFFICE INSTALADA", ""],
            ["PROCESADOR", "", "CANDADO DE SEGURIDAD", ""],
            ["RAM", "", "", ""],
            ["DISCO DURO", "", "", ""]
        ];
    }

    private static IReadOnlyList<IReadOnlyList<string>> BuildPeripheralRows()
    {
        return
        [
            ["IMPRESORAS / OTROS", ""],
            ["LEXMARK", ""],
            ["ZEBRA", ""],
            ["HUELLERO", ""],
            ["OTROS", ""]
        ];
    }

    private static IReadOnlyList<IReadOnlyList<string>> BuildApplicationsRows(DeliveryFormChecklistSection? firstSection, DeliveryFormChecklistSection? secondSection, int itemRows)
    {
        var validationLabels = new Dictionary<int, string>
        {
            [1] = "Verificar nombre de equipo",
            [2] = "Cambio descripcion del equipo",
            [3] = "Validacion Suite MS Office",
            [4] = "Cuenta AD",
            [7] = "Version instalada AV",
            [8] = "Estado de conexion AV"
        };

        var rows = new List<IReadOnlyList<string>>
        {
            new[] { "APLICACIONES", "", "", "ADMINISTRATIVAS", "", "", "VALIDACIONES", "" }
        };

        for (var index = 0; index < itemRows; index++)
        {
            var rowNumber = index + 1;
            var medicalLabel = firstSection is not null && index < firstSection.Items.Count ? firstSection.Items[index].Label : "";
            var adminLabel = secondSection is not null && index < secondSection.Items.Count ? secondSection.Items[index].Label : "";
            validationLabels.TryGetValue(rowNumber, out var validationLabel);

            rows.Add([medicalLabel, "", "", adminLabel, "", "", validationLabel ?? string.Empty, ""]);
        }

        return rows;
    }

    private static XElement BuildTable(IReadOnlyList<IReadOnlyList<string>> rows, IReadOnlyList<int> widths, Func<int, bool> isLabelColumn)
    {
        var table = new XElement(W + "tbl",
            new XElement(W + "tblPr",
                new XElement(W + "tblW", new XAttribute(W + "w", "0"), new XAttribute(W + "type", "auto")),
                new XElement(W + "tblBorders",
                    new XElement(W + "top", new XAttribute(W + "val", "single"), new XAttribute(W + "sz", "4"), new XAttribute(W + "space", "0"), new XAttribute(W + "color", "auto")),
                    new XElement(W + "left", new XAttribute(W + "val", "single"), new XAttribute(W + "sz", "4"), new XAttribute(W + "space", "0"), new XAttribute(W + "color", "auto")),
                    new XElement(W + "bottom", new XAttribute(W + "val", "single"), new XAttribute(W + "sz", "4"), new XAttribute(W + "space", "0"), new XAttribute(W + "color", "auto")),
                    new XElement(W + "right", new XAttribute(W + "val", "single"), new XAttribute(W + "sz", "4"), new XAttribute(W + "space", "0"), new XAttribute(W + "color", "auto")),
                    new XElement(W + "insideH", new XAttribute(W + "val", "single"), new XAttribute(W + "sz", "4"), new XAttribute(W + "space", "0"), new XAttribute(W + "color", "auto")),
                    new XElement(W + "insideV", new XAttribute(W + "val", "single"), new XAttribute(W + "sz", "4"), new XAttribute(W + "space", "0"), new XAttribute(W + "color", "auto"))),
                new XElement(W + "tblCellMar",
                    new XElement(W + "left", new XAttribute(W + "w", "57"), new XAttribute(W + "type", "dxa")),
                    new XElement(W + "right", new XAttribute(W + "w", "57"), new XAttribute(W + "type", "dxa")),
                    new XElement(W + "top", new XAttribute(W + "w", "14"), new XAttribute(W + "type", "dxa")),
                    new XElement(W + "bottom", new XAttribute(W + "w", "14"), new XAttribute(W + "type", "dxa")))));

        var grid = new XElement(W + "tblGrid");
        foreach (var width in widths)
        {
            grid.Add(new XElement(W + "gridCol", new XAttribute(W + "w", width)));
        }
        table.Add(grid);

        for (var rowIndex = 0; rowIndex < rows.Count; rowIndex++)
        {
            table.Add(BuildRow(rows[rowIndex], widths, isLabelColumn, rowIndex == 0));
        }

        return table;
    }

    private static XElement BuildRow(IReadOnlyList<string> texts, IReadOnlyList<int> widths, Func<int, bool> isLabelColumn, bool isHeader)
    {
        var row = new XElement(W + "tr");
        for (var column = 0; column < texts.Count; column++)
        {
            var bold = isHeader || isLabelColumn(column);
            row.Add(BuildCell(texts[column], widths[column], bold));
        }
        return row;
    }

    private static XElement BuildCell(string text, int width, bool bold)
    {
        var value = string.IsNullOrWhiteSpace(text) ? " " : text.Trim();
        return new XElement(W + "tc",
            new XElement(W + "tcPr",
                new XElement(W + "tcW", new XAttribute(W + "w", width), new XAttribute(W + "type", "dxa"))),
            new XElement(W + "p",
                new XElement(W + "pPr",
                    new XElement(W + "spacing",
                        new XAttribute(W + "before", "0"),
                        new XAttribute(W + "after", "0"),
                        new XAttribute(W + "line", "240"),
                        new XAttribute(W + "lineRule", "auto"))),
                BuildTextRun(value, bold, 16)));
    }

    private static XElement BuildParagraph(string text, bool bold = false, bool centered = false, int fontSize = 18)
    {
        var paragraphProperties = new XElement(W + "pPr",
            new XElement(W + "spacing",
                new XAttribute(W + "before", "0"),
                new XAttribute(W + "after", "80"),
                new XAttribute(W + "line", "240"),
                new XAttribute(W + "lineRule", "auto")));

        if (centered)
        {
            paragraphProperties.Add(new XElement(W + "jc", new XAttribute(W + "val", "center")));
        }

        return new XElement(W + "p", paragraphProperties, BuildTextRun(text, bold, fontSize));
    }

    private static XElement BuildSpacerParagraph()
        => new XElement(W + "p",
            new XElement(W + "pPr",
                new XElement(W + "spacing",
                    new XAttribute(W + "before", "0"),
                    new XAttribute(W + "after", "0"),
                    new XAttribute(W + "line", "240"),
                    new XAttribute(W + "lineRule", "auto"))));

    private static XElement BuildSignatureLineParagraph()
    {
        return new XElement(W + "p",
            new XElement(W + "pPr",
                new XElement(W + "spacing",
                    new XAttribute(W + "before", "0"),
                    new XAttribute(W + "after", "0"),
                    new XAttribute(W + "line", "240"),
                    new XAttribute(W + "lineRule", "auto"))),
            new XElement(W + "bookmarkStart", new XAttribute(W + "id", "0"), new XAttribute(W + "name", "_Hlk185929370")),
            new XElement(W + "r", BuildRunProperties(false, 18), new XElement(W + "tab")),
            new XElement(W + "bookmarkEnd", new XAttribute(W + "id", "0")));
    }

    private static XElement BuildTextRun(string text, bool bold, int fontSize)
        => new XElement(W + "r", BuildRunProperties(bold, fontSize),
            new XElement(W + "t", new XAttribute(XNamespace.Xml + "space", "preserve"), text));

    private static XElement BuildRunProperties(bool bold, int fontSize)
    {
        var runProperties = new XElement(W + "rPr",
            new XElement(W + "sz", new XAttribute(W + "val", fontSize)),
            new XElement(W + "szCs", new XAttribute(W + "val", fontSize)));

        if (bold)
        {
            runProperties.Add(new XElement(W + "b"));
            runProperties.Add(new XElement(W + "bCs"));
        }

        return runProperties;
    }

    private static void AddEntry(ZipArchive archive, string entryName, XDocument content)
    {
        var entry = archive.CreateEntry(entryName, CompressionLevel.Optimal);
        using var stream = entry.Open();
        content.Save(stream, SaveOptions.DisableFormatting);
    }

    private static XDocument BuildContentTypes()
    {
        return new XDocument(new XElement(Ct + "Types",
            new XElement(Ct + "Default", new XAttribute("Extension", "rels"), new XAttribute("ContentType", "application/vnd.openxmlformats-package.relationships+xml")),
            new XElement(Ct + "Default", new XAttribute("Extension", "xml"), new XAttribute("ContentType", "application/xml")),
            new XElement(Ct + "Override", new XAttribute("PartName", "/word/document.xml"), new XAttribute("ContentType", "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml")),
            new XElement(Ct + "Override", new XAttribute("PartName", "/word/styles.xml"), new XAttribute("ContentType", "application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml")),
            new XElement(Ct + "Override", new XAttribute("PartName", "/docProps/core.xml"), new XAttribute("ContentType", "application/vnd.openxmlformats-package.core-properties+xml")),
            new XElement(Ct + "Override", new XAttribute("PartName", "/docProps/app.xml"), new XAttribute("ContentType", "application/vnd.openxmlformats-officedocument.extended-properties+xml"))));
    }

    private static XDocument BuildRootRelationships()
    {
        return new XDocument(new XElement(PackageRelationships + "Relationships",
            new XElement(PackageRelationships + "Relationship",
                new XAttribute("Id", "rId1"),
                new XAttribute("Type", "http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument"),
                new XAttribute("Target", "word/document.xml")),
            new XElement(PackageRelationships + "Relationship",
                new XAttribute("Id", "rId2"),
                new XAttribute("Type", "http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties"),
                new XAttribute("Target", "docProps/core.xml")),
            new XElement(PackageRelationships + "Relationship",
                new XAttribute("Id", "rId3"),
                new XAttribute("Type", "http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties"),
                new XAttribute("Target", "docProps/app.xml"))));
    }

    private static XDocument BuildDocumentRelationships()
    {
        return new XDocument(new XElement(PackageRelationships + "Relationships",
            new XElement(PackageRelationships + "Relationship",
                new XAttribute("Id", "rId1"),
                new XAttribute("Type", "http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles"),
                new XAttribute("Target", "styles.xml"))));
    }

    private static XDocument BuildStyles()
    {
        return new XDocument(new XElement(W + "styles",
            new XElement(W + "docDefaults",
                new XElement(W + "rPrDefault",
                    new XElement(W + "rPr",
                        new XElement(W + "rFonts",
                            new XAttribute(W + "ascii", "Calibri"),
                            new XAttribute(W + "eastAsia", "Calibri"),
                            new XAttribute(W + "hAnsi", "Calibri")),
                        new XElement(W + "sz", new XAttribute(W + "val", "18")),
                        new XElement(W + "szCs", new XAttribute(W + "val", "18")))),
                new XElement(W + "pPrDefault",
                    new XElement(W + "pPr",
                        new XElement(W + "spacing",
                            new XAttribute(W + "after", "0"),
                            new XAttribute(W + "line", "240"),
                            new XAttribute(W + "lineRule", "auto")))))));
    }

    private static XDocument BuildCoreProperties()
    {
        return new XDocument(new XElement(Cp + "coreProperties",
            new XAttribute(XNamespace.Xmlns + "cp", Cp),
            new XAttribute(XNamespace.Xmlns + "dc", Dc),
            new XAttribute(XNamespace.Xmlns + "dcterms", Dcterms),
            new XAttribute(XNamespace.Xmlns + "dcmitype", "http://purl.org/dc/dcmitype/"),
            new XAttribute(XNamespace.Xmlns + "xsi", Xsi),
            new XElement(Dc + "title", "Formulario de entrega de equipo"),
            new XElement(Cp + "lastModifiedBy", "Syntro"),
            new XElement(Dcterms + "created", new XAttribute(Xsi + "type", "dcterms:W3CDTF"), "2026-01-01T00:00:00Z"),
            new XElement(Dcterms + "modified", new XAttribute(Xsi + "type", "dcterms:W3CDTF"), "2026-01-01T00:00:00Z")));
    }

    private static XDocument BuildAppProperties()
    {
        return new XDocument(new XElement(ExtendedProperties + "Properties",
            new XAttribute(XNamespace.Xmlns + "vt", "http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"),
            new XElement(ExtendedProperties + "Application", "Syntro")));
    }
}
