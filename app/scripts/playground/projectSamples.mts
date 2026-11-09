const playgroundCs = `using System.Runtime.CompilerServices;
using Microsoft.Extensions.Logging;

namespace Fastforward.Playground;

public enum Kind { Text, Image, Archive, Program }

public sealed record PlaygroundFile(int Id, string Name, long Size, Kind Kind)
{
    public string Extension => Path.GetExtension(Name).TrimStart('.').ToLowerInvariant();
}

public interface IPlaygroundRepository
{
    Task<PlaygroundFile?> FindAsync(int id, CancellationToken token = default);

    IAsyncEnumerable<PlaygroundFile> ListAsync(CancellationToken token = default);
}

[DebuggerDisplay("{Count} files")]
public sealed class PlaygroundRepository(ILogger<PlaygroundRepository> logger) : IPlaygroundRepository
{
    private readonly List<PlaygroundFile> _files =
    [
        new(1, "emoji-grid.md", 5_451, Kind.Text),
        new(2, "large.png", 1_336_667, Kind.Image),
        new(3, "bundle.zip", 512, Kind.Archive),
        new(4, "where.exe", 0x1_0000, Kind.Program),
    ];

    public int Count => _files.Count;

    public Task<PlaygroundFile?> FindAsync(int id, CancellationToken token = default)
    {
        logger.LogInformation("Finding file {Id}", id);
        return Task.FromResult(_files.FirstOrDefault(file => file.Id == id));
    }

    public async IAsyncEnumerable<PlaygroundFile> ListAsync(
        [EnumeratorCancellation] CancellationToken token = default)
    {
        foreach (var file in _files.OrderByDescending(file => file.Size).ThenBy(file => file.Name))
        {
            await Task.Yield();
            token.ThrowIfCancellationRequested();
            yield return file;
        }
    }
}

public static class Describe
{
    private const long Kib = 1024;

    public static string Size(this PlaygroundFile file) => file.Size switch
    {
        < Kib => $"{file.Size} B",
        < Kib * Kib => $"{file.Size / (double)Kib:F1} KiB",
        _ => $"{file.Size / (double)(Kib * Kib):F1} MiB",
    };

    public static string What(PlaygroundFile file) => file switch
    {
        { Kind: Kind.Image, Size: > 1_000_000 } => "a large image",
        { Kind: Kind.Image } => "an image",
        { Extension: "md" or "markdown" } => "Markdown",
        var other when other.Name.StartsWith('.') => "a hidden file",
        _ => "a file",
    };

    public static string Json(PlaygroundFile file) =>
        $$"""
        { "name": "{{file.Name}}", "size": {{file.Size}}, "what": "{{What(file)}}" }
        """;

    public static IEnumerable<IGrouping<Kind, PlaygroundFile>> ByKind(IEnumerable<PlaygroundFile> files) =>
        from file in files
        where file.Size > 0
        orderby file.Name
        group file by file.Kind;
}
`;

const playgroundCsChanged = playgroundCs
  .replace(
    'new(4, "where.exe", 0x1_0000, Kind.Program),',
    'new(4, "where.exe", 0x1_0000, Kind.Program),\n        new(5, "Playground.sln", 1_234, Kind.Text),',
  )
  .replace(
    '{ Kind: Kind.Image } => "an image",',
    '{ Kind: Kind.Image } => "an image",\n        { Kind: Kind.Program } => "a program",',
  )
  .replace(
    'logger.LogInformation("Finding file {Id}", id);',
    'logger.LogDebug("Finding file {Id} of {Count}", id, Count);',
  )
  .replace('.ThenBy(file => file.Name)', '');

export const dotnetFiles: Readonly<Record<string, string>> = {
  'Program.cs': `using Fastforward.Playground;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddSingleton<IPlaygroundRepository, PlaygroundRepository>();

var app = builder.Build();

app.MapGet("/files/{id:int}", async (int id, IPlaygroundRepository files, CancellationToken token) =>
    await files.FindAsync(id, token) is { } file
        ? Results.Ok(new { file.Name, Size = file.Size(), What = Describe.What(file) })
        : Results.NotFound());

app.MapGet("/files", (IPlaygroundRepository files, CancellationToken token) => files.ListAsync(token));

await app.RunAsync();
`,
  'Playground.cs': playgroundCs,
  'PlaygroundTests.cs': `using Xunit;

namespace Fastforward.Playground.Tests;

public class DescribeTests
{
    [Theory]
    [InlineData(512, "512 B")]
    [InlineData(2048, "2.0 KiB")]
    [InlineData(5_368_709_123, "5120.0 MiB")]
    public void DescribesSizes(long size, string expected) =>
        Assert.Equal(expected, new PlaygroundFile(1, "a.bin", size, Kind.Archive).Size());

    [Fact]
    public async Task ListsTheLargestFirst()
    {
        var repository = new PlaygroundRepository(NullLogger<PlaygroundRepository>.Instance);
        var names = new List<string>();
        await foreach (var file in repository.ListAsync())
        {
            names.Add(file.Name);
        }

        Assert.Equal("large.png", names[0]);
    }
}
`,
  'build.csx': `#r "nuget: Newtonsoft.Json, 13.0.3"

using Newtonsoft.Json;

var files = Directory.EnumerateFiles(".", "*", SearchOption.AllDirectories).Take(10);
Console.WriteLine(JsonConvert.SerializeObject(files, Formatting.Indented));
`,
  'Playground.csproj': `<Project Sdk="Microsoft.NET.Sdk.Web">

  <PropertyGroup>
    <TargetFramework>net10.0</TargetFramework>
    <Nullable>enable</Nullable>
    <ImplicitUsings>enable</ImplicitUsings>
    <TreatWarningsAsErrors>true</TreatWarningsAsErrors>
    <RootNamespace>Fastforward.Playground</RootNamespace>
  </PropertyGroup>

  <ItemGroup>
    <PackageReference Include="Microsoft.Extensions.Logging" />
    <PackageReference Include="xunit" />
    <None Update="appsettings.json" CopyToOutputDirectory="PreserveNewest" />
  </ItemGroup>

</Project>
`,
  'Playground.Library.fsproj': `<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>net10.0</TargetFramework>
  </PropertyGroup>
  <ItemGroup>
    <Compile Include="Library.fs" />
  </ItemGroup>
</Project>
`,
  'Playground.sln': `
Microsoft Visual Studio Solution File, Format Version 12.00
# Visual Studio Version 17
VisualStudioVersion = 17.14.36310.24
MinimumVisualStudioVersion = 10.0.40219.1
Project("{9A19103F-16F7-4668-BE54-9A1E7A4F7556}") = "Playground", "Playground.csproj", "{8F3E2A6B-1C2D-4E5F-9A0B-1C2D3E4F5A6B}"
EndProject
Project("{6EC3EE1D-3C4E-46DD-8F32-0CC8E7565705}") = "Playground.Library", "Playground.Library.fsproj", "{2B7C9D1E-3F4A-4B5C-8D6E-7F8A9B0C1D2E}"
EndProject
Global
	GlobalSection(SolutionConfigurationPlatforms) = preSolution
		Debug|Any CPU = Debug|Any CPU
		Release|Any CPU = Release|Any CPU
	EndGlobalSection
	GlobalSection(ProjectConfigurationPlatforms) = postSolution
		{8F3E2A6B-1C2D-4E5F-9A0B-1C2D3E4F5A6B}.Debug|Any CPU.ActiveCfg = Debug|Any CPU
		{8F3E2A6B-1C2D-4E5F-9A0B-1C2D3E4F5A6B}.Debug|Any CPU.Build.0 = Debug|Any CPU
	EndGlobalSection
EndGlobal
`,
  'Playground.slnx': `<Solution>
  <Project Path="Playground.csproj" />
  <Project Path="Playground.Library.fsproj" />
</Solution>
`,
  'Directory.Build.props': `<Project>
  <PropertyGroup>
    <LangVersion>latest</LangVersion>
    <AnalysisLevel>latest-recommended</AnalysisLevel>
    <EnforceCodeStyleInBuild>true</EnforceCodeStyleInBuild>
  </PropertyGroup>
</Project>
`,
  'Directory.Packages.props': `<Project>
  <PropertyGroup>
    <ManagePackageVersionsCentrally>true</ManagePackageVersionsCentrally>
  </PropertyGroup>
  <ItemGroup>
    <PackageVersion Include="Microsoft.Extensions.Logging" Version="10.0.0" />
    <PackageVersion Include="xunit" Version="2.9.3" />
  </ItemGroup>
</Project>
`,
  'global.json': `{
  "sdk": {
    "version": "10.0.100",
    "rollForward": "latestFeature"
  }
}
`,
  'nuget.config': `<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <packageSources>
    <clear />
    <add key="nuget.org" value="https://api.nuget.org/v3/index.json" />
  </packageSources>
</configuration>
`,
  'appsettings.json': `{
  "Logging": {
    "LogLevel": {
      "Default": "Information",
      "Microsoft.AspNetCore": "Warning"
    }
  },
  "ConnectionStrings": {
    "Playground": "Server=(localdb)\\\\mssqllocaldb;Database=Playground;Trusted_Connection=True"
  },
  "AllowedHosts": "*"
}
`,
  '.editorconfig': `root = true

[*]
indent_style = space
insert_final_newline = true

[*.cs]
indent_size = 4
dotnet_sort_system_directives_first = true
csharp_style_var_for_built_in_types = true:suggestion
csharp_style_namespace_declarations = file_scoped:warning
dotnet_diagnostic.CA1062.severity = none
`,
  'Files.razor': `@page "/files"
@inject IPlaygroundRepository Files

<PageTitle>Files</PageTitle>

<h1>Files</h1>

@if (files is null)
{
    <p><em>Loading...</em></p>
}
else
{
    <ul>
        @foreach (var file in files)
        {
            <li class="@(file.Kind == Kind.Image ? "image" : "")">@file.Name (@file.Size())</li>
        }
    </ul>
}

@code {
    private List<PlaygroundFile>? files;

    protected override async Task OnInitializedAsync()
    {
        files = [];
        await foreach (var file in Files.ListAsync())
        {
            files.Add(file);
        }
    }
}
`,
  '_Layout.cshtml': `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <title>@ViewData["Title"] - Playground</title>
</head>
<body>
    @if (User.Identity?.IsAuthenticated == true)
    {
        <p>Signed in as @User.Identity.Name</p>
    }
    <main>@RenderBody()</main>
    @await RenderSectionAsync("Scripts", required: false)
</body>
</html>
`,
  'MainWindow.xaml': `<Window x:Class="Fastforward.Playground.MainWindow"
        xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        Title="Playground" Height="450" Width="800">
    <Grid Margin="12">
        <Grid.RowDefinitions>
            <RowDefinition Height="Auto" />
            <RowDefinition Height="*" />
        </Grid.RowDefinitions>
        <TextBox Grid.Row="0" Text="{Binding Filter, UpdateSourceTrigger=PropertyChanged}" />
        <ListBox Grid.Row="1" ItemsSource="{Binding Files}" DisplayMemberPath="Name" />
    </Grid>
</Window>
`,
  'Resources.resx': `<?xml version="1.0" encoding="utf-8"?>
<root>
  <resheader name="resmimetype">
    <value>text/microsoft-resx</value>
  </resheader>
  <data name="Greeting" xml:space="preserve">
    <value>Hello from the playground</value>
  </data>
  <data name="Greeting.hu" xml:space="preserve">
    <value>Szia a játszótérről</value>
  </data>
</root>
`,
  'Library.fs': `module Fastforward.Playground.Library

open System

type Kind =
    | Text
    | Image of width: int * height: int
    | Archive of entries: string list

type PlaygroundFile = { Name: string; Size: int64; Kind: Kind }

let describe file =
    match file.Kind with
    | Text -> "text"
    | Image (width, height) when width > height -> sprintf "a wide image of %dx%d" width height
    | Image (width, height) -> $"an image of {width}x{height}"
    | Archive entries -> $"an archive of {List.length entries} entries"

let largest files =
    files
    |> List.filter (fun file -> file.Size > 0L)
    |> List.sortByDescending (fun file -> file.Size)
    |> List.tryHead
`,
  'Script.fsx': `#r "nuget: FSharp.Data"

open System.IO

Directory.EnumerateFiles(".", "*.md")
|> Seq.map (fun path -> Path.GetFileName path, FileInfo(path).Length)
|> Seq.iter (fun (name, size) -> printfn "%s: %d bytes" name size)
`,
  'Module.vb': `Imports System.Linq

Public Module Playground
    Public Function Describe(size As Long) As String
        Select Case size
            Case Is < 1024
                Return $"{size} B"
            Case Is < 1024 * 1024
                Return $"{size / 1024:F1} KiB"
            Case Else
                Return $"{size / 1024 / 1024:F1} MiB"
        End Select
    End Function

    Sub Main()
        Dim sizes = {512L, 2048L, 1048576L}
        For Each line In sizes.Select(Function(size) Describe(size))
            Console.WriteLine(line)
        Next
    End Sub
End Module
`,
};

export const dotnetPair = [playgroundCs, playgroundCsChanged] as const;

const mainRs = `use std::collections::HashMap;
use std::fmt;
use std::path::Path;

#[derive(Debug, Clone, PartialEq)]
enum Kind {
    Text,
    Image { width: u32, height: u32 },
    Archive(Vec<String>),
}

#[derive(Debug)]
struct File<'a> {
    name: &'a str,
    size: u64,
    kind: Kind,
}

impl fmt::Display for File<'_> {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{} ({})", self.name, human(self.size))
    }
}

fn human(size: u64) -> String {
    match size {
        0..1024 => format!("{size} B"),
        1024..1_048_576 => format!("{:.1} KiB", size as f64 / 1024.0),
        _ => format!("{:.1} MiB", size as f64 / 1_048_576.0),
    }
}

fn extension(name: &str) -> Option<&str> {
    Path::new(name).extension()?.to_str()
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let files = vec![
        File { name: "emoji-grid.md", size: 5_451, kind: Kind::Text },
        File { name: "large.png", size: 1_336_667, kind: Kind::Image { width: 3000, height: 2000 } },
        File { name: "bundle.zip", size: 512, kind: Kind::Archive(vec!["readme.txt".into()]) },
    ];
    let mut by_extension: HashMap<&str, Vec<&File>> = HashMap::new();
    for file in &files {
        by_extension.entry(extension(file.name).unwrap_or("")).or_default().push(file);
    }
    for (extension, files) in &by_extension {
        let names: Vec<String> = files.iter().map(ToString::to_string).collect();
        println!("{extension}: {}", names.join(", "));
    }
    if let Some(File { kind: Kind::Image { width, height }, .. }) =
        files.iter().find(|file| matches!(file.kind, Kind::Image { .. }))
    {
        println!("the image is {width}x{height}");
    }
    Ok(())
}
`;

export const rustFiles: Readonly<Record<string, string>> = {
  'main.rs': mainRs,
  'lib.rs': `//! Sizes of the playground, grouped the way the commander shows them.

/// Groups the thousands of a size as the Size column does.
pub fn grouped(size: u64) -> String {
    let digits = size.to_string();
    let mut out = String::with_capacity(digits.len() + digits.len() / 3);
    for (i, digit) in digits.chars().enumerate() {
        if i > 0 && (digits.len() - i) % 3 == 0 {
            out.push(',');
        }
        out.push(digit);
    }
    out
}

pub struct Grouped<I: Iterator<Item = u64>>(pub I);

impl<I: Iterator<Item = u64>> Iterator for Grouped<I> {
    type Item = String;

    fn next(&mut self) -> Option<Self::Item> {
        self.0.next().map(grouped)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    macro_rules! grouped {
        ($($size:expr),*) => {
            Grouped(vec![$($size),*].into_iter()).collect::<Vec<_>>()
        };
    }

    #[test]
    fn groups_thousands() {
        assert_eq!(grouped(5_368_709_123), "5,368,709,123");
        assert_eq!(grouped(999), "999");
    }

    #[test]
    fn groups_every_size() {
        assert_eq!(grouped![1000, 1], ["1,000", "1"]);
    }
}
`,
  'Cargo.toml': `[package]
name = "playground"
version = "0.1.0"
edition = "2024"

[dependencies]
serde = { version = "1", features = ["derive"] }

[dev-dependencies]
pretty_assertions = "1"

[profile.release]
lto = true
`,
  'Cargo.lock': `# This file is automatically @generated by Cargo.
# It is not intended for manual editing.
version = 4

[[package]]
name = "playground"
version = "0.1.0"
dependencies = [
 "serde",
]

[[package]]
name = "serde"
version = "1.0.228"
source = "registry+https://github.com/rust-lang/crates.io-index"
checksum = "9a8e94ea7f378bd32cbbd37198a4a91436180c5bb472411e48b5ec2e2124ae9e"
`,
};

export const rustPair = [
  mainRs,
  mainRs
    .replace(
      '    Archive(Vec<String>),',
      '    Archive(Vec<String>),\n    Program,',
    )
    .replace(
      '0..1024 => format!("{size} B"),',
      '0 => "empty".to_string(),\n        1..1024 => format!("{size} B"),',
    )
    .replace(
      'println!("the image is {width}x{height}");',
      'println!("the image is {width} by {height}");',
    ),
] as const;

const csvRow = (cells: readonly (string | number)[], separator = ',') =>
  cells
    .map((cell) =>
      typeof cell === 'string' && /[",;\t\n]/.test(cell)
        ? `"${cell.replaceAll('"', '""')}"`
        : String(cell),
    )
    .join(separator);

export const csvFiles: Readonly<Record<string, string>> = {
  'csv-quoted-fields.csv': `${[
    ['name', 'note', 'size'],
    ['plain', 'nothing to quote', 1],
    ['comma', 'one, two, three', 2],
    ['quote', 'she said "hello"', 3],
    ['newline', 'a line\nand another inside one field', 4],
    ['empty', '', 5],
  ]
    .map((row) => csvRow(row))
    .join('\r\n')}\r\n`,
  'csv-semicolons-as-excel-writes-in-hungary.csv': `﻿${[
    ['Név', 'Összeg', 'Dátum'],
    ['Árvíztűrő tükörfúrógép', '1 234,56', '2026.02.01.'],
    ['Kávé', '890,00', '2026.02.02.'],
    ['Sütemény', '1 250,50', '2026.02.03.'],
  ]
    .map((row) => csvRow(row, ';'))
    .join('\r\n')}\r\n`,
  'csv-tab-separated.tsv': `${[
    ['id', 'name', 'kind'],
    [1, 'emoji-grid.md', 'text'],
    [2, 'large.png', 'image'],
    [3, 'bundle.zip', 'archive'],
  ]
    .map((row) => row.join('\t'))
    .join('\n')}\n`,
  'csv-unicode.csv': `${[
    ['language', 'greeting'],
    ['Magyar', 'Szia, világ!'],
    ['日本語', 'こんにちは世界'],
    ['עברית', 'שלום עולם'],
    ['Emoji', '👋🌍 👩‍💻'],
  ]
    .map((row) => csvRow(row))
    .join('\n')}\n`,
  'csv-wide-of-200-columns.csv': `${[
    Array.from({ length: 200 }, (_, column) => `column ${column + 1}`),
    ...Array.from({ length: 50 }, (_row, row) =>
      Array.from({ length: 200 }, (_, column) => row * 200 + column),
    ),
  ]
    .map((row) => csvRow(row))
    .join('\n')}\n`,
};

export const csvRows = (count: number) =>
  `id,name,size,modified,kind\n${Array.from(
    { length: count },
    (_, i) =>
      `${i + 1},file-${i + 1}.txt,${(i * 7919) % 1_000_000},2026-02-${String((i % 28) + 1).padStart(2, '0')},${['text', 'image', 'archive', 'program'][i % 4]}`,
  ).join('\n')}\n`;
