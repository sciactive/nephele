<svelte:head>
  <script>
    document.addEventListener('DOMContentLoaded', () => {
      const uploadForm = document.getElementById('upload');
      const uploadOutput = document.getElementById('uploadOutput');
      const uploads = document.getElementById('uploads');
      const refresh = document.getElementById('refresh');
      let files = [];

      uploadForm.addEventListener('submit', (event) => {
        event.preventDefault();
        files = files.concat(
          Array.prototype.slice.call(uploadForm.file.files).map(file => ({
            done: false,
            file
          }))
        );
        uploadForm.reset();

        doUpload();
      });

      function doUpload() {
        for (let i = 0; i < files.length; i++) {
          const file = files[i];

          if (file.element == null) {
            uploadOutput.style.display = 'block';
            refresh.disabled = true;

            const element = document.createElement('label');
            element.style.display = 'block';
            element.style.marginBottom = '0.5em';

            const progress = document.createElement('progress');
            progress.value = 0;
            progress.max = 100;
            progress.style.width = '100px';
            progress.style.marginRight = '0.5em';
            element.appendChild(progress);

            const name = document.createElement('span');
            name.innerText = file.file.name;
            element.appendChild(name);

            uploads.appendChild(element);

            const xhr = new XMLHttpRequest();
            xhr.upload.addEventListener('progress', (event) => {
              if (event.lengthComputable) {
                progress.value = (event.loaded / event.total) * 100;
                progress.title = ((event.loaded / event.total) * 100) + '%';
              }
            });
            xhr.addEventListener('progress', (event) => {
              if (event.lengthComputable) {
                progress.value = (event.loaded / event.total) * 100;
                progress.title = ((event.loaded / event.total) * 100) + '%';
              }
            });
            xhr.addEventListener('loadend', () => {
              if (xhr.readyState === 4 && xhr.status >= 200 && xhr.status < 300) {
                progress.value = 100;
                progress.title = 'Done';
              } else {
                progress.value = 0;
                progress.title = 'Error';
                const error = document.createElement('span');
                error.innerText = ' (error)';
                element.appendChild(error);
              }
              file.done = true;

              if (files.find(file => !file.done) == null) {
                refresh.disabled = false;
              }
            });
            xhr.open('PUT', file.file.name, true);
            xhr.setRequestHeader('Content-Type', file.file.type);
            xhr.send(file.file);
          }
        }
      }
    });
  </script>
</svelte:head>

<h1>Index of {self.url.pathname}</h1>

<table style="width: 100%;" cellspacing="0">
  <thead>
    <tr>
      <th style="text-align: left; border-bottom: 1px solid #ddd;">
        <a href="?sort=name&amp;order={(urlParams.order === 'asc' && urlParams.sort === 'name') || (!('sort' in urlParams)) ? 'desc' : 'asc'}">
          Name
        </a>
        {#if urlParams.sort === 'name' || !('sort' in urlParams)}
          <span style="float: right; margin-right: 1em;">
            {urlParams.order === 'desc' ? '↑' : '↓'}
          </span>
        {/if}
      </th>
      <th style="text-align: left; border-bottom: 1px solid #ddd;">
        <a href="?sort=type&amp;order={urlParams.order === 'asc' && urlParams.sort === 'type' ? 'desc' : 'asc'}">
          Type
        </a>
        {#if urlParams.sort === 'type'}
          <span style="float: right; margin-right: 1em;">
            {urlParams.order === 'desc' ? '↑' : '↓'}
          </span>
        {/if}
      </th>
      <th style="text-align: left; border-bottom: 1px solid #ddd;">
        <a href="?sort=modified&amp;order={urlParams.order === 'asc' && urlParams.sort === 'modified' ? 'desc' : 'asc'}">
          Last Modified
        </a>
        {#if urlParams.sort === 'modified'}
          <span style="float: right; margin-right: 1em;">
            {urlParams.order === 'desc' ? '↑' : '↓'}
          </span>
        {/if}
      </th>
      <th style="text-align: left; border-bottom: 1px solid #ddd;">
        <a href="?sort=size&amp;order={urlParams.order === 'asc' && urlParams.sort === 'size' ? 'desc' : 'asc'}">
          Size
        </a>
        {#if urlParams.sort === 'size'}
          <span style="float: right; margin-right: 1em;">
            {urlParams.order === 'desc' ? '↑' : '↓'}
          </span>
        {/if}
      </th>
    </tr>
  </thead>
  <tbody>
    {#if self.url.pathname != '/'}
      <tr>
        <td><a href="{`${self.url.pathname}`.replace(/\/[^\/]*\/?$/, '')}/">..</a></td>
        <td></td>
        <td></td>
        <td>Parent Directory</td>
      </tr>
    {/if}
    {#each sortEntries() as entry, i (entry.name)}
      <tr style="{(self.url.pathname != '/' ? !(i % 2) : i % 2) ? 'background-color: #ddd;' : ''}">
        <td><a href={entry.url}>{entry.name}{entry.directory ? '/' : ''}</a></td>
        <td>{entry.directory ? 'Directory' : entry.type}</td>
        <td>{new Date(entry.lastModified).toLocaleString()}</td>
        <td title={entry.directory ? '' : `${entry.size} bytes`}>{entry.directory ? '' : prettySize(entry.size)}</td>
      </tr>
    {/each}
  </tbody>
</table>

<form name="upload" id="upload" style="margin-top: 1em;">
  Upload: <input type="file" name="file" multiple />
  <button>Submit</button>
</form>

<div id="uploadOutput" style="margin-top: 1em; display: none;">
  <div id="uploads"></div>

  <button id="refresh" onclick="window.location.reload()">Refresh</button>
</div>

<p>Powered by {name}</p>

<script>
  export let entries = [];
  export let self;
  export let urlParams;
  export let name;

  function sortEntries() {
    return entries.sort((a, b) => {
      if (a.directory && !b.directory) {
        return -1;
      } else if (b.directory && !a.directory) {
        return 1;
      }

      switch (urlParams.sort) {
        case 'name':
        default:
          return urlParams.order === 'desc'
            ? b.name.localeCompare(a.name)
            : a.name.localeCompare(b.name);
        case 'type':
          if (a.directory) {
            return urlParams.order === 'desc'
              ? b.name.localeCompare(a.name)
              : a.name.localeCompare(b.name);
          }
          return urlParams.order === 'desc'
            ? b.type.localeCompare(a.type)
            : a.type.localeCompare(b.type);
        case 'modified':
          return urlParams.order === 'desc'
            ? b.lastModified - a.lastModified
            : a.lastModified - b.lastModified;
        case 'size':
          if (a.directory) {
            return urlParams.order === 'desc'
              ? b.name.localeCompare(a.name)
              : a.name.localeCompare(b.name);
          }
          return urlParams.order === 'desc'
            ? b.size - a.size
            : a.size - b.size;
      }
    });
  }

  function prettySize(size) {
    return `${prettySizeDecimal(size)} (${prettySizeBinary(size)})`
  }

  function prettySizeDecimal(size) {
    const KB = 1000;
    const MB = KB * 1000;
    const GB = MB * 1000;
    const TB = GB * 1000;

    if (size > TB) {
      return `${Math.round(size / TB * 100) / 100}TB`;
    } else if (size > GB) {
      return `${Math.round(size / GB * 100) / 100}GB`;
    } else if (size > MB) {
      return `${Math.round(size / MB * 100) / 100}MB`;
    } else if (size > KB) {
      return `${Math.round(size / KB * 100) / 100}KB`;
    } else {
      return `${size}B`;
    }
  }

  function prettySizeBinary(size) {
    const KB = 1024;
    const MB = KB * 1024;
    const GB = MB * 1024;
    const TB = GB * 1024;

    if (size > TB) {
      return `${Math.round(size / TB * 100) / 100}TiB`;
    } else if (size > GB) {
      return `${Math.round(size / GB * 100) / 100}GiB`;
    } else if (size > MB) {
      return `${Math.round(size / MB * 100) / 100}MiB`;
    } else if (size > KB) {
      return `${Math.round(size / KB * 100) / 100}KiB`;
    } else {
      return `${size}B`;
    }
  }
</script>
