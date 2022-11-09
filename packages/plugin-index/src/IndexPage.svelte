<svelte:head>
  <script>
    document.addEventListener('DOMContentLoaded', () => {
      const refreshContainer = document.getElementById('refreshContainer');
      const refresh = document.getElementById('refresh');
      let requests = [];

      /**
       * Make Directory
       */
      handleMkdirs: {
        const mkdirContainer = document.getElementById('mkdirContainer');
        mkdirContainer.style.display = '';
        const mkdirForm = document.getElementById('mkdir');
        const mkdirs = document.getElementById('mkdirs');

        mkdirForm.addEventListener('submit', (event) => {
          event.preventDefault();
          requests = requests.concat([
            {
              type: 'mkdir',
              done: null,
              name: mkdirForm.name.value,
            },
          ]);
          mkdirForm.reset();

          doMkdir();
        });

        function doMkdir() {
          for (let i = 0; i < requests.length; i++) {
            const dir = requests[i];

            if (dir.type === 'mkdir' && dir.done === null) {
              dir.done = false;
              mkdirs.style.display = '';
              refreshContainer.style.display = '';
              refresh.disabled = true;

              const element = document.createElement('div');
              element.style.marginBottom = '0.5em';

              const progress = document.createElement('div');
              progress.style.display = 'inline-block';
              progress.innerText = 'Working...';
              progress.style.border = '1px solid #000';
              progress.style.width = '100px';
              progress.style.marginRight = '0.5em';
              progress.style.textAlign = 'center';
              element.appendChild(progress);

              const name = document.createElement('span');
              name.innerText = dir.name;
              element.appendChild(name);

              mkdirs.appendChild(element);

              const xhr = new XMLHttpRequest();
              xhr.addEventListener('loadend', () => {
                if (
                  xhr.readyState === 4 &&
                  xhr.status >= 200 &&
                  xhr.status < 300
                ) {
                  progress.innerText = 'Success.';
                } else {
                  progress.innerText = `Error: ${xhr.status} ${xhr.statusText}`;
                }
                dir.done = true;

                if (requests.find((request) => !request.done) == null) {
                  refresh.disabled = false;
                }
              });
              xhr.open('MKCOL', dir.name, true);
              xhr.send();
            }
          }
        }
      }

      /**
       * File Upload
       */
      handleUploads: {
        const uploadContainer = document.getElementById('uploadContainer');
        uploadContainer.style.display = '';
        const uploadForm = document.getElementById('upload');
        const uploads = document.getElementById('uploads');

        uploadForm.addEventListener('submit', (event) => {
          event.preventDefault();
          requests = requests.concat(
            Array.prototype.slice.call(uploadForm.file.files).map((file) => ({
              type: 'upload',
              done: null,
              file,
            }))
          );
          uploadForm.reset();

          doUpload();
        });

        function doUpload() {
          for (let i = 0; i < requests.length; i++) {
            const file = requests[i];

            if (file.type === 'upload' && file.done === null) {
              file.done = false;
              uploads.style.display = '';
              refreshContainer.style.display = '';
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
                  progress.title = (event.loaded / event.total) * 100 + '%';
                }
              });
              xhr.addEventListener('progress', (event) => {
                if (event.lengthComputable) {
                  progress.value = (event.loaded / event.total) * 100;
                  progress.title = (event.loaded / event.total) * 100 + '%';
                }
              });
              xhr.addEventListener('loadend', () => {
                if (
                  xhr.readyState === 4 &&
                  xhr.status >= 200 &&
                  xhr.status < 300
                ) {
                  progress.value = 100;
                  progress.title = 'Done';
                } else {
                  progress.value = 0;
                  progress.title = 'Error';
                  const error = document.createElement('span');
                  error.innerText = ` (Error: ${xhr.status} ${xhr.statusText})`;
                  element.appendChild(error);
                }
                file.done = true;

                if (requests.find((request) => !request.done) == null) {
                  refresh.disabled = false;
                }
              });
              xhr.open('PUT', file.file.name, true);
              xhr.setRequestHeader('Content-Type', file.file.type);
              xhr.send(file.file);
            }
          }
        }
      }

      /**
       * Show Actions
       */
      const actions = document.querySelectorAll('.action');

      for (let i = 0; i < actions.length; i++) {
        const action = actions[i];
        action.style.display = '';
      }

      /**
       * Rename
       */
      handleRenames: {
        const fileTable = document.getElementById('fileTable');
        const renameContainer = document.getElementById('renameContainer');
        const renames = document.getElementById('renames');

        fileTable.addEventListener('click', (event) => {
          if (!event.target.classList.contains('rename')) {
            return;
          }

          event.preventDefault();

          const newName = prompt(
            'Enter the new name.',
            event.target.parentNode.dataset['name']
          );
          if (newName == null || newName == '') {
            return;
          }

          requests = requests.concat([
            {
              type: 'rename',
              done: null,
              name: event.target.parentNode.dataset['name'],
              newName,
            },
          ]);

          doRename();
        });

        function doRename() {
          for (let i = 0; i < requests.length; i++) {
            const file = requests[i];

            if (file.type === 'rename' && file.done === null) {
              file.done = false;
              renameContainer.style.display = '';
              refreshContainer.style.display = '';
              refresh.disabled = true;

              const element = document.createElement('div');
              element.style.marginBottom = '0.5em';

              const progress = document.createElement('div');
              progress.style.display = 'inline-block';
              progress.innerText = 'Working...';
              progress.style.border = '1px solid #000';
              progress.style.width = '100px';
              progress.style.marginRight = '0.5em';
              progress.style.textAlign = 'center';
              element.appendChild(progress);

              const name = document.createElement('span');
              name.innerText = file.name;
              element.appendChild(name);

              renames.appendChild(element);

              const xhr = new XMLHttpRequest();
              xhr.addEventListener('loadend', () => {
                if (
                  xhr.readyState === 4 &&
                  xhr.status >= 200 &&
                  xhr.status < 300
                ) {
                  progress.innerText = 'Success.';
                } else {
                  progress.innerText = `Error: ${xhr.status} ${xhr.statusText}`;
                }
                file.done = true;

                if (requests.find((request) => !request.done) == null) {
                  refresh.disabled = false;
                }
              });
              xhr.open('MOVE', file.name, true);
              xhr.setRequestHeader(
                'Destination',
                `${fileTable.dataset['root']}`.replace('//?$/', '/') +
                  encodeURIComponent(file.newName)
              );
              xhr.send();
            }
          }
        }
      }

      /**
       * Delete
       */
      handleDeletes: {
        const fileTable = document.getElementById('fileTable');
        const deleteContainer = document.getElementById('deleteContainer');
        const deletes = document.getElementById('deletes');

        fileTable.addEventListener('click', (event) => {
          if (!event.target.classList.contains('delete')) {
            return;
          }

          event.preventDefault();

          if (
            !confirm(
              `Are you sure you want to delete "${
                event.target.parentNode.dataset['name']
              }"?${
                event.target.parentNode.dataset['name'].match(/\/$/)
                  ? ' This will delete all of its contents too.'
                  : ''
              }`
            )
          ) {
            return;
          }

          requests = requests.concat([
            {
              type: 'delete',
              done: null,
              name: event.target.parentNode.dataset['name'],
            },
          ]);

          doDelete();
        });

        function doDelete() {
          for (let i = 0; i < requests.length; i++) {
            const file = requests[i];

            if (file.type === 'delete' && file.done === null) {
              file.done = false;
              deleteContainer.style.display = '';
              refreshContainer.style.display = '';
              refresh.disabled = true;

              const element = document.createElement('div');
              element.style.marginBottom = '0.5em';

              const progress = document.createElement('div');
              progress.style.display = 'inline-block';
              progress.innerText = 'Working...';
              progress.style.border = '1px solid #000';
              progress.style.width = '100px';
              progress.style.marginRight = '0.5em';
              progress.style.textAlign = 'center';
              element.appendChild(progress);

              const name = document.createElement('span');
              name.innerText = file.name;
              element.appendChild(name);

              deletes.appendChild(element);

              const xhr = new XMLHttpRequest();
              xhr.addEventListener('loadend', () => {
                if (
                  xhr.readyState === 4 &&
                  xhr.status >= 200 &&
                  xhr.status < 300
                ) {
                  progress.innerText = 'Success.';
                } else {
                  progress.innerText = `Error: ${xhr.status} ${xhr.statusText}`;
                }
                file.done = true;

                if (requests.find((request) => !request.done) == null) {
                  refresh.disabled = false;
                }
              });
              xhr.open('DELETE', file.name, true);
              xhr.send();
            }
          }
        }
      }
    });
  </script>
</svelte:head>

<h1>Index of {decodeURIComponent(self.url.pathname)}</h1>

<table id="fileTable" style="width: 100%;" cellspacing="0" data-root={self.url}>
  <thead>
    <tr>
      <th style="text-align: left; border-bottom: 1px solid #ddd;">
        <a
          href="?sort=name&amp;order={(urlParams.order === 'asc' &&
            urlParams.sort === 'name') ||
          !('sort' in urlParams)
            ? 'desc'
            : 'asc'}"
        >
          Name
        </a>
        {#if urlParams.sort === 'name' || !('sort' in urlParams)}
          <span style="float: right; margin-right: 1em;">
            {urlParams.order === 'desc' ? '↑' : '↓'}
          </span>
        {/if}
      </th>
      <th style="text-align: left; border-bottom: 1px solid #ddd;">
        <a
          href="?sort=type&amp;order={urlParams.order === 'asc' &&
          urlParams.sort === 'type'
            ? 'desc'
            : 'asc'}"
        >
          Type
        </a>
        {#if urlParams.sort === 'type'}
          <span style="float: right; margin-right: 1em;">
            {urlParams.order === 'desc' ? '↑' : '↓'}
          </span>
        {/if}
      </th>
      <th style="text-align: left; border-bottom: 1px solid #ddd;">
        <a
          href="?sort=modified&amp;order={urlParams.order === 'asc' &&
          urlParams.sort === 'modified'
            ? 'desc'
            : 'asc'}"
        >
          Last Modified
        </a>
        {#if urlParams.sort === 'modified'}
          <span style="float: right; margin-right: 1em;">
            {urlParams.order === 'desc' ? '↑' : '↓'}
          </span>
        {/if}
      </th>
      <th style="text-align: left; border-bottom: 1px solid #ddd;">
        <a
          href="?sort=size&amp;order={urlParams.order === 'asc' &&
          urlParams.sort === 'size'
            ? 'desc'
            : 'asc'}"
        >
          Size
        </a>
        {#if urlParams.sort === 'size'}
          <span style="float: right; margin-right: 1em;">
            {urlParams.order === 'desc' ? '↑' : '↓'}
          </span>
        {/if}
      </th>
      <th
        class="action"
        style="text-align: left; border-bottom: 1px solid #ddd; display: none;"
        >Actions</th
      >
    </tr>
  </thead>
  <tbody>
    {#if self.url.pathname != '/'}
      <tr>
        <td
          ><a href="{`${self.url.pathname}`.replace(/\/[^\/]*\/?$/, '')}/">..</a
          ></td
        >
        <td />
        <td />
        <td>Parent Directory</td>
        <td class="action" style="display: none;" />
      </tr>
    {/if}
    {#each sortEntries() as entry, i (entry.name)}
      <tr
        style={(self.url.pathname != '/' ? !(i % 2) : i % 2)
          ? 'background-color: #ddd;'
          : ''}
      >
        <td><a href={entry.url}>{entry.name}{entry.directory ? '/' : ''}</a></td
        >
        <td>{entry.directory ? 'Directory' : entry.type}</td>
        <td>{new Date(entry.lastModified).toLocaleString()}</td>
        <td title={entry.directory ? '' : `${entry.size} bytes`}
          >{entry.directory ? '' : prettySize(entry.size)}</td
        >
        <td
          class="action"
          style="display: none;"
          data-name={`${entry.name}${entry.directory ? '/' : ''}`}
        >
          <button class="rename">Rename</button>
          <button class="delete">Delete</button>
        </td>
      </tr>
    {/each}
  </tbody>
</table>

<div id="mkdirContainer" style="display: none;">
  <form name="mkdir" id="mkdir" style="margin-top: 1em;">
    Make Directory: <input type="text" name="name" placeholder="Name" />
    <button>Submit</button>
  </form>

  <div id="mkdirs" style="margin-top: 1em; display: none;" />
</div>

<div id="uploadContainer" style="display: none;">
  <form name="upload" id="upload" style="margin-top: 1em;">
    Upload: <input type="file" name="file" multiple />
    <button>Submit</button>
  </form>

  <div id="uploads" style="margin-top: 1em; display: none;" />
</div>

<div id="renameContainer" style="margin-top: 1em; display: none;">
  Rename Requests

  <div id="renames" />
</div>

<div id="deleteContainer" style="margin-top: 1em; display: none;">
  Delete Requests

  <div id="deletes" />
</div>

<div id="refreshContainer" style="margin-top: 1em; display: none;">
  <button id="refresh" onclick="window.location.reload()">Refresh</button>
</div>

<p style="font-size: smaller;">Powered by {name}</p>

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
          return urlParams.order === 'desc' ? b.size - a.size : a.size - b.size;
      }
    });
  }

  function prettySize(size) {
    return `${prettySizeDecimal(size)} (${prettySizeBinary(size)})`;
  }

  function prettySizeDecimal(size) {
    const KB = 1000;
    const MB = KB * 1000;
    const GB = MB * 1000;
    const TB = GB * 1000;

    if (size > TB) {
      return `${Math.round((size / TB) * 100) / 100}TB`;
    } else if (size > GB) {
      return `${Math.round((size / GB) * 100) / 100}GB`;
    } else if (size > MB) {
      return `${Math.round((size / MB) * 100) / 100}MB`;
    } else if (size > KB) {
      return `${Math.round((size / KB) * 100) / 100}KB`;
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
      return `${Math.round((size / TB) * 100) / 100}TiB`;
    } else if (size > GB) {
      return `${Math.round((size / GB) * 100) / 100}GiB`;
    } else if (size > MB) {
      return `${Math.round((size / MB) * 100) / 100}MiB`;
    } else if (size > KB) {
      return `${Math.round((size / KB) * 100) / 100}KiB`;
    } else {
      return `${size}B`;
    }
  }
</script>
