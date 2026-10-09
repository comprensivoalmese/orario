/*
  © 2026 Istituto Comprensivo di Almese (www.comprensivoalmese.it) – realizzato dal Gruppo Wolf.
  Tutti i diritti riservati: nessun uso senza permesso scritto della scuola (vedi LICENZA.md).

  installa-icone.cs – il programma «Installa icone IC Almese» (installa-icone.exe).
  Al doppio clic apre una finestrella dove si sceglie cosa mettere sul desktop:
  - Luis@i (l'app per vedere l'orario)
  - Orario Facile (l'app per preparare l'orario)
  Ogni icona apre la pagina del sito in una finestra tutta sua (Chrome o Edge con --app), come un programma.
  Non serve essere amministratori: tocca solo il desktop e il menu Start di chi lo usa.
  Le icone (.ico) sono già dentro l'exe e si copiano in %LOCALAPPDATA%\IC Almese.

  Come si ricompila (dopo una modifica), da PowerShell nella cartella installa\ :
    & "$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319\csc.exe" /nologo /codepage:65001 /target:winexe /out:installa-icone.exe `
      /win32icon:..\app\icone\luisai.ico /resource:..\app\icone\luisai.ico,luisai.ico `
      /resource:..\orario-facile\icone\orario-facile.ico,orario-facile.ico `
      /r:System.Windows.Forms.dll /r:System.Drawing.dll /r:Microsoft.CSharp.dll installa-icone.cs
  (il compilatore C# è già dentro Windows: niente da installare; si scrive in C# 5, la versione che conosce)
*/
using System;
using System.Collections.Generic;
using System.Drawing;
using System.IO;
using System.Windows.Forms;

static class InstallaIcone
{
  // Indirizzo del sito pubblicato con GitHub Pages
  const string Sito = "https://comprensivoalmese.github.io/orario/";

  // Un programma da mettere sul desktop
  class Programma
  {
    public string Nome, Pagina, Icona, Descrizione, Spiegazione;
    public CheckBox Casella;
  }

  // Un browser trovato sul PC
  class Browser
  {
    public string Nome, Percorso;
    public override string ToString() { return Nome; }
  }

  static readonly List<Programma> programmi = new List<Programma> {
    new Programma { Nome = "Luis@i", Pagina = "app/", Icona = "luisai.ico",
      Descrizione = "Luis@i: l'orario della scuola (IC Almese)",
      Spiegazione = "&Luis@i – per vedere l'orario (docenti, studenti, monitor di classe)" },
    new Programma { Nome = "Orario Facile", Pagina = "orario-facile/", Icona = "orario-facile.ico",
      Descrizione = "Orario Facile: crea l'orario e organizza le sostituzioni (IC Almese)",
      Spiegazione = "&Orario Facile – per preparare l'orario e le sostituzioni (solo per chi è autorizzato)" }
  };

  [STAThread]
  static void Main()
  {
    Application.EnableVisualStyles();
    Application.SetCompatibleTextRenderingDefault(false);

    // 1. Cerca i browser: Google Chrome (lo stesso account Google della scuola) e Microsoft Edge
    List<Browser> browser = TrovaBrowser();
    if (browser.Count == 0)
    {
      MessageBox.Show("Non ho trovato né Google Chrome né Microsoft Edge.\nInstallane uno e riprova.",
        "Installa icone IC Almese", MessageBoxButtons.OK, MessageBoxIcon.Error);
      return;
    }

    // 2. La finestra con le scelte
    Form f = new Form();
    f.Text = "Installa le icone – IC Almese";
    f.FormBorderStyle = FormBorderStyle.FixedDialog;
    f.MaximizeBox = false; f.MinimizeBox = false;
    f.StartPosition = FormStartPosition.CenterScreen;
    f.AutoScaleMode = AutoScaleMode.Dpi;
    f.AutoSize = true; f.AutoSizeMode = AutoSizeMode.GrowAndShrink;
    f.Font = new Font("Segoe UI", 10f);
    try { f.Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath); } catch { }

    // tutto in colonna, uno sotto l'altro
    FlowLayoutPanel colonna = new FlowLayoutPanel();
    colonna.FlowDirection = FlowDirection.TopDown;
    colonna.AutoSize = true; colonna.AutoSizeMode = AutoSizeMode.GrowAndShrink;
    colonna.Padding = new Padding(16);
    colonna.WrapContents = false;
    f.Controls.Add(colonna);

    Label titolo = new Label();
    titolo.Text = "Cosa vuoi mettere sul desktop?";
    titolo.Font = new Font("Segoe UI", 12f, FontStyle.Bold);
    titolo.AutoSize = true;
    titolo.Margin = new Padding(0, 0, 0, 10);
    colonna.Controls.Add(titolo);

    // una casella per ogni programma, tutte spuntate all'inizio
    foreach (Programma p in programmi)
    {
      p.Casella = new CheckBox();
      p.Casella.Text = p.Spiegazione;
      p.Casella.Checked = true;
      p.Casella.AutoSize = true;
      p.Casella.Margin = new Padding(0, 2, 0, 2);
      colonna.Controls.Add(p.Casella);
    }

    CheckBox menuStart = new CheckBox();
    menuStart.Text = "Metti le icone anche nel &menu Start (cartella «IC Almese»)";
    menuStart.Checked = true;
    menuStart.AutoSize = true;
    menuStart.Margin = new Padding(0, 12, 0, 2);
    colonna.Controls.Add(menuStart);

    // scelta del browser con cui si aprono le pagine
    FlowLayoutPanel rigaBrowser = new FlowLayoutPanel();
    rigaBrowser.AutoSize = true; rigaBrowser.WrapContents = false;
    rigaBrowser.Margin = new Padding(0, 10, 0, 0);
    Label etichetta = new Label();
    etichetta.Text = "&Apri con:";
    etichetta.AutoSize = true;
    etichetta.Margin = new Padding(0, 6, 8, 0);
    ComboBox sceltaBrowser = new ComboBox();
    sceltaBrowser.DropDownStyle = ComboBoxStyle.DropDownList;
    sceltaBrowser.Width = 220;
    sceltaBrowser.AccessibleName = "Browser con cui aprire le pagine";
    foreach (Browser b in browser) sceltaBrowser.Items.Add(b);
    sceltaBrowser.SelectedIndex = 0;
    rigaBrowser.Controls.Add(etichetta);
    rigaBrowser.Controls.Add(sceltaBrowser);
    colonna.Controls.Add(rigaBrowser);

    // i tasti Installa e Annulla
    FlowLayoutPanel tasti = new FlowLayoutPanel();
    tasti.AutoSize = true; tasti.WrapContents = false;
    tasti.Margin = new Padding(0, 16, 0, 0);
    Button installa = new Button();
    installa.Text = "&Installa";
    installa.AutoSize = true; installa.Padding = new Padding(10, 2, 10, 2);
    Button annulla = new Button();
    annulla.Text = "Annulla";
    annulla.AutoSize = true; annulla.Padding = new Padding(10, 2, 10, 2);
    annulla.DialogResult = DialogResult.Cancel;
    tasti.Controls.Add(installa);
    tasti.Controls.Add(annulla);
    colonna.Controls.Add(tasti);
    f.AcceptButton = installa;   // Invio = Installa
    f.CancelButton = annulla;    // Esc = Annulla

    installa.Click += delegate
    {
      List<Programma> scelti = programmi.FindAll(delegate(Programma p) { return p.Casella.Checked; });
      if (scelti.Count == 0)
      {
        MessageBox.Show(f, "Spunta almeno un programma.", f.Text, MessageBoxButtons.OK, MessageBoxIcon.Information);
        return;
      }
      try
      {
        Browser b = (Browser)sceltaBrowser.SelectedItem;
        Installa(scelti, b, menuStart.Checked);
        string nomi = string.Join(" e ", scelti.ConvertAll(delegate(Programma p) { return p.Nome; }).ToArray());
        string nota = giaPresenti.Count == 0 ? "" :
          "C'era già un'icona di " + string.Join(" e ", giaPresenti.ToArray()) + " (per esempio installata da Chrome): l'ho lasciata com'era.\n\n";
        MessageBox.Show(f, "Fatto! Sul desktop trovi " + nomi + ".\n\n" + nota +
          "La prima volta fai l'accesso con il tuo account @comprensivoalmese.it.\n" +
          "Per togliere un'icona basta cancellarla.", f.Text, MessageBoxButtons.OK, MessageBoxIcon.Information);
        f.Close();
      }
      catch (Exception ex)
      {
        MessageBox.Show(f, "Non sono riuscito a creare le icone:\n" + ex.Message, f.Text, MessageBoxButtons.OK, MessageBoxIcon.Error);
      }
    };

    Application.Run(f);
  }

  // Cerca Chrome ed Edge nei posti dove si installano di solito
  static List<Browser> TrovaBrowser()
  {
    string pf = Environment.GetEnvironmentVariable("ProgramFiles") ?? "";
    string pf86 = Environment.GetEnvironmentVariable("ProgramFiles(x86)") ?? "";
    string locale = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
    string[,] candidati = {
      { "Google Chrome", Path.Combine(pf, @"Google\Chrome\Application\chrome.exe") },
      { "Google Chrome", Path.Combine(pf86, @"Google\Chrome\Application\chrome.exe") },
      { "Google Chrome", Path.Combine(locale, @"Google\Chrome\Application\chrome.exe") },
      { "Microsoft Edge", Path.Combine(pf86, @"Microsoft\Edge\Application\msedge.exe") },
      { "Microsoft Edge", Path.Combine(pf, @"Microsoft\Edge\Application\msedge.exe") }
    };
    List<Browser> trovati = new List<Browser>();
    for (int i = 0; i < candidati.GetLength(0); i++)
    {
      string nome = candidati[i, 0], percorso = candidati[i, 1];
      // ogni browser una volta sola (il primo percorso che esiste)
      if (File.Exists(percorso) && !trovati.Exists(delegate(Browser b) { return b.Nome == nome; }))
        trovati.Add(new Browser { Nome = nome, Percorso = percorso });
    }
    return trovati;
  }

  // Copia le icone e crea i collegamenti (sul desktop e, se richiesto, nel menu Start)
  // i programmi che avevano già un'icona fatta in un altro modo (si lasciano come sono)
  static readonly List<string> giaPresenti = new List<string>();

  static void Installa(List<Programma> scelti, Browser browser, bool anchenelMenuStart)
  {
    giaPresenti.Clear();
    string cartella = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "IC Almese");
    Directory.CreateDirectory(cartella);

    List<string> dove = new List<string>();
    dove.Add(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory));
    if (anchenelMenuStart)
    {
      string start = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs), "IC Almese");
      Directory.CreateDirectory(start);
      dove.Add(start);
    }

    // WScript.Shell è il componente di Windows che sa creare i collegamenti (.lnk)
    dynamic shell = Activator.CreateInstance(Type.GetTypeFromProgID("WScript.Shell"));
    foreach (Programma p in scelti)
    {
      // l'icona è dentro l'exe: la si scrive in %LOCALAPPDATA%\IC Almese (i collegamenti vogliono un file .ico)
      string icona = Path.Combine(cartella, p.Icona);
      using (Stream s = typeof(InstallaIcone).Assembly.GetManifestResourceStream(p.Icona))
      using (FileStream fs = File.Create(icona))
        s.CopyTo(fs);

      foreach (string d in dove)
      {
        string lnk = Path.Combine(d, p.Nome + ".lnk");
        // c'è già un'icona con lo stesso nome che non abbiamo fatto noi (per esempio l'app installata da Chrome):
        // la si lascia com'è, così non si rovina niente
        if (File.Exists(lnk))
        {
          string argomenti = "";
          try { argomenti = (string)shell.CreateShortcut(lnk).Arguments; } catch { }
          if (argomenti.IndexOf("--app=" + Sito, StringComparison.OrdinalIgnoreCase) < 0)
          {
            if (!giaPresenti.Contains(p.Nome)) giaPresenti.Add(p.Nome);
            continue;
          }
        }
        dynamic c = shell.CreateShortcut(lnk);
        c.TargetPath = browser.Percorso;
        c.Arguments = "--app=" + Sito + p.Pagina;   // finestra senza barre, come un programma
        c.WorkingDirectory = Path.GetDirectoryName(browser.Percorso);
        c.IconLocation = icona + ",0";
        c.Description = p.Descrizione;
        c.Save();
      }
    }
  }
}
